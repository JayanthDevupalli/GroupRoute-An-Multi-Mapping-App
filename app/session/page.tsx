'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useRoom } from '@/context/RoomContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import ChatPanel from '@/components/ChatPanel';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, onSnapshot, serverTimestamp, deleteDoc, getDoc, updateDoc, addDoc, query, orderBy, limit } from 'firebase/firestore';
import { Copy, Navigation, CheckCircle2, Loader2, MapPin, Users, Eye, EyeOff, MessageCircle, UserMinus, Trash2, LogOut, Search, RefreshCcw, Zap } from 'lucide-react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as turf from '@turf/turf';

interface Participant {
  id: string;
  name: string;
  lat: number;
  lng: number;
  joinedAt: any;
  distanceToDestination?: number; // km
  isOnline?: boolean;
  eta?: number; // seconds
  routeGeoJSON?: string;
}

const getUserColor = (uid: string) => {
  const colors = ['#f43f5e', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#14b8a6'];
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = uid.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

interface Destination {
  lat: number;
  lng: number;
}

export default function RoomPage() {
  const { roomId } = useRoom();
  const { user } = useAuth();
  const router = useRouter();

  const [isHost, setIsHost] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [loadingAccess, setLoadingAccess] = useState(true);

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [hasLocation, setHasLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isComputing, setIsComputing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestMessage, setLatestMessage] = useState<any>(null);
  
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<{ [key: string]: maplibregl.Marker }>({});
  const destMarker = useRef<maplibregl.Marker | null>(null);
  const lastRoutePos = useRef<{lat: number, lng: number} | null>(null);
  const prevDest = useRef<Destination | null>(null);
  const hasInitialFitBounds = useRef(false);
  const prevDestForBounds = useRef<Destination | null>(null);

  // 1. Gatekeeper Logic
  useEffect(() => {
    if (!user) return;
    if (!roomId) {
      router.push('/lobby');
      return;
    }

    const checkAccess = async () => {
      const roomRef = doc(db, 'rooms', roomId);
      const roomSnap = await getDoc(roomRef);
      if (!roomSnap.exists()) {
        router.push('/lobby');
        return;
      }
      
      const hostId = roomSnap.data().hostId;
      if (hostId === user.uid) {
        setIsHost(true);
        setIsApproved(true);
        setLoadingAccess(false);
        return;
      }

      const participantRef = doc(db, `rooms/${roomId}/participants`, user.uid);
      const unsubscribe = onSnapshot(participantRef, (docSnap) => {
        if (docSnap.exists()) {
          setIsApproved(true);
        } else {
          setIsApproved(false);
        }
        setLoadingAccess(false);
      });

      return unsubscribe;
    };

    const cleanup = checkAccess();
    return () => {
      cleanup.then(unsub => { if (unsub) unsub() });
    };
  }, [user, roomId, router]);

  // 1.5 Room details listener (for destination)
  useEffect(() => {
    if (!roomId || !isApproved) return;
    const roomRef = doc(db, 'rooms', roomId);
    const unsub = onSnapshot(roomRef, (docSnap) => {
      if (docSnap.exists()) {
        if (docSnap.data().destination) {
          setDestination(docSnap.data().destination);
        } else {
          setDestination(null);
        }
        if (docSnap.data().name) setRoomName(docSnap.data().name);
      } else {
        router.push('/lobby');
      }
    });
    return () => unsub();
  }, [roomId, isApproved, router]);

  // 2. Geolocation
  useEffect(() => {
    if (!user || !roomId || !isApproved) return;

    let isInitialJoin = true;
    let watchId: number;

    const updateLocation = async (lat: number, lng: number) => {
      try {
        if (isInitialJoin) {
          await setDoc(doc(db, `rooms/${roomId}/participants`, user.uid), {
            name: user.displayName || 'Guest',
            lat,
            lng,
            isOnline: true,
            lastActive: serverTimestamp(),
            joinedAt: serverTimestamp(),
          }, { merge: true }); 
          isInitialJoin = false;
          setHasLocation(true);
        } else {
          await updateDoc(doc(db, `rooms/${roomId}/participants`, user.uid), {
            lat,
            lng,
            isOnline: true,
            lastActive: serverTimestamp(),
          });
        }
      } catch (err) {
        console.error("Failed to update location securely:", err);
        if (isInitialJoin) setLocationError("Failed to update location securely.");
      }
    };

    if ("geolocation" in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          updateLocation(position.coords.latitude, position.coords.longitude);
        },
        (error) => {
          console.error("Location error:", error);
          if (isInitialJoin) setLocationError("We need your location to find the meeting spot!");
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
      );
    } else {
      setLocationError("Geolocation is not supported by your browser.");
    }

    return () => {
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      updateDoc(doc(db, `rooms/${roomId}/participants`, user.uid), {
        isOnline: false,
        lastActive: serverTimestamp()
      }).catch(console.error);
    };
  }, [user, roomId, isApproved]);

  // 3. Listen to Participants & Calc Distances
  useEffect(() => {
    if (!roomId || !isApproved) return;

    const unsubscribe = onSnapshot(collection(db, `rooms/${roomId}/participants`), (snapshot) => {
      const activeUsers: Participant[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        let dist = 0;
        if (destination && data.lat && data.lng) {
          const from = turf.point([data.lng, data.lat]);
          const to = turf.point([destination.lng, destination.lat]);
          dist = turf.distance(from, to, { units: 'kilometers' });
        }
        activeUsers.push({ id: docSnap.id, distanceToDestination: dist, ...data } as Participant);
      });
      // Sort by distance if available
      if (destination) {
        activeUsers.sort((a, b) => (a.distanceToDestination || 0) - (b.distanceToDestination || 0));
      }
      setParticipants(activeUsers);
    });

    return () => unsubscribe();
  }, [roomId, isApproved, destination]);

  // 4. Initialize MapLibre
  useEffect(() => {
    if (!hasLocation || !isApproved || !mapContainer.current) return;
    if (map.current) return;

    const newMap = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
      center: [0, 0],
      zoom: 2,
      attributionControl: false,
    });
    
    newMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    const clickHandler = async (e: maplibregl.MapMouseEvent) => {
      if (!isHost || !roomId) return;
      const { lng, lat } = e.lngLat;
      try {
        await updateDoc(doc(db, 'rooms', roomId), { destination: { lat, lng } });
      } catch (error) {
        console.error("Failed to set destination", error);
      }
    };
    
    newMap.on('click', clickHandler);
    map.current = newMap;
    
    // Force resize to fix potential blank map rendering
    setTimeout(() => { if (map.current) map.current.resize(); }, 100);
    setTimeout(() => { if (map.current) map.current.resize(); }, 500);

    return () => {
      newMap.remove();
      map.current = null;
      markers.current = {};
      destMarker.current = null;
    };
  }, [hasLocation, isApproved, isHost, roomId]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      setSearchResults(data);
    } catch (err) {
      console.error("Geocoding failed", err);
    } finally {
      setIsSearching(false);
    }
  };

  const selectSearchResult = async (result: any) => {
    if (!isHost || !roomId) return;
    try {
      await updateDoc(doc(db, 'rooms', roomId), { 
        destination: { lat: parseFloat(result.lat), lng: parseFloat(result.lon), name: result.display_name } 
      });
      setSearchResults([]);
      setSearchQuery('');
    } catch (error) {
      console.error("Failed to set destination", error);
    }
  };

  const computeGravityCenter = async () => {
    if (!isHost || !roomId || participants.length < 2) return;
    setIsComputing(true);
    try {
      const features = turf.featureCollection(
        participants.filter(p => p.lat && p.lng).map(p => turf.point([p.lng, p.lat]))
      );
      if (features.features.length === 0) return;
      const center = turf.center(features);
      const [lng, lat] = center.geometry.coordinates;

      // Reverse geocode to get the address of the EXACT midpoint
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18`;
      const res = await fetch(url);
      const data = await res.json();

      let placeName = "Computed Midpoint";
      if (data && data.display_name) {
        placeName = data.name || data.address?.road || data.address?.suburb || data.display_name.split(',')[0];
      }

      await updateDoc(doc(db, 'rooms', roomId), { 
        destination: { lat, lng, name: `Midpoint: ${placeName}` } 
      });
    } catch (err) {
      console.error("Failed to compute gravity center", err);
    } finally {
      setIsComputing(false);
    }
  };

  // 5. Update Map Markers & Bounds
  useEffect(() => {
    if (!map.current) return;
    const currentMap = map.current;

    const activeIds = new Set(participants.map(p => p.id));

    Object.keys(markers.current).forEach(id => {
      if (!activeIds.has(id)) {
        markers.current[id].remove();
        delete markers.current[id];
      }
    });

    const bounds = new maplibregl.LngLatBounds();
    let hasPoints = false;

    participants.forEach((p) => {
      if (!p.lat || !p.lng) return;
      
      bounds.extend([p.lng, p.lat]);
      hasPoints = true;

      if (!markers.current[p.id]) {
        const color = getUserColor(p.id);
        const el = document.createElement('div');
        el.className = 'w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-[15px] shadow-[0_4px_12px_rgba(0,0,0,0.3)] border-[3px] border-white transition-transform hover:scale-110 cursor-pointer overflow-hidden';
        el.style.backgroundColor = color;
        el.innerHTML = p.name.charAt(0).toUpperCase();

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([p.lng, p.lat])
          .setPopup(new maplibregl.Popup({ offset: 25, closeButton: false }).setHTML(`<div class="font-semibold text-[#1E293B] px-3 py-1.5 text-[14px]">${p.name}</div>`))
          .addTo(currentMap);
          
        markers.current[p.id] = marker;
      } else {
        markers.current[p.id].setLngLat([p.lng, p.lat]);
      }
    });

    // Handle Destination Marker
    if (destination) {
      bounds.extend([destination.lng, destination.lat]);
      hasPoints = true;

      if (!destMarker.current) {
        const el = document.createElement('div');
        el.className = 'w-12 h-12 flex items-center justify-center text-rose-500 drop-shadow-xl transition-transform hover:scale-110 cursor-pointer -mt-6';
        el.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="currentColor" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3" fill="white"></circle></svg>';
        
        destMarker.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([destination.lng, destination.lat])
          .setPopup(new maplibregl.Popup({ offset: 40, closeButton: false }).setHTML(`<div class="font-bold text-rose-600 px-3 py-1.5 text-[14px]">Destination</div>`))
          .addTo(currentMap);
      } else {
        destMarker.current.setLngLat([destination.lng, destination.lat]);
      }
    } else {
      if (destMarker.current) {
        destMarker.current.remove();
        destMarker.current = null;
      }
    }

    if (hasPoints) {
      let shouldFitBounds = false;
      
      if (!hasInitialFitBounds.current) {
        shouldFitBounds = true;
        hasInitialFitBounds.current = true;
      }

      if (destination && (!prevDestForBounds.current || prevDestForBounds.current.lat !== destination.lat || prevDestForBounds.current.lng !== destination.lng)) {
        shouldFitBounds = true;
        prevDestForBounds.current = destination;
      }

      if (shouldFitBounds) {
        const validParticipants = participants.filter(p => p.lat && p.lng);
        if (validParticipants.length === 1 && !destination) {
          currentMap.flyTo({ 
            center: [validParticipants[0].lng, validParticipants[0].lat], 
            zoom: 14, 
            duration: 2000 
          });
        } else {
          currentMap.fitBounds(bounds, { padding: 100, maxZoom: 14, duration: 2000 });
        }
      }
    }
  }, [participants, destination]);

  // 6. Fetch OSRM Route for Current User
  useEffect(() => {
    if (!destination || !user) return;
    
    const currentUser = participants.find(p => p.id === user.uid);
    if (!currentUser || !currentUser.lat || !currentUser.lng) return;

    let shouldFetch = false;
    if (!prevDest.current || prevDest.current.lat !== destination.lat || prevDest.current.lng !== destination.lng) {
      shouldFetch = true;
      prevDest.current = destination;
    }

    if (!lastRoutePos.current) {
      shouldFetch = true;
    } else {
      const dist = turf.distance(
        turf.point([lastRoutePos.current.lng, lastRoutePos.current.lat]),
        turf.point([currentUser.lng, currentUser.lat]),
        { units: 'meters' }
      );
      if (dist > 50) { // Update route every 50 meters
        shouldFetch = true;
      }
    }

    if (shouldFetch) {
      lastRoutePos.current = { lat: currentUser.lat, lng: currentUser.lng };
      const fetchRoute = async () => {
        try {
          const url = `https://router.project-osrm.org/route/v1/driving/${currentUser.lng},${currentUser.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
          const response = await fetch(url);
          const data = await response.json();
          if (data.routes && data.routes[0] && roomId) {
            updateDoc(doc(db, `rooms/${roomId}/participants`, user.uid), {
              eta: data.routes[0].duration,
              routeGeoJSON: JSON.stringify(data.routes[0].geometry)
            }).catch(console.error);
          }
        } catch (err) {
          console.error("Failed to fetch route", err);
        }
      };
      fetchRoute();
    }
  }, [destination, participants, user, roomId]);

  // 7. Draw Colored Routes for All Participants
  useEffect(() => {
    if (!map.current) return;
    const currentMap = map.current;

    const drawRoutes = () => {
      if (!currentMap.isStyleLoaded()) return;

      participants.forEach((p) => {
        const sourceId = `route-${p.id}`;
        const color = getUserColor(p.id);

        if (p.routeGeoJSON && destination) {
          try {
            const parsedGeoJSON = typeof p.routeGeoJSON === 'string' ? JSON.parse(p.routeGeoJSON) : p.routeGeoJSON;
            if (currentMap.getSource(sourceId)) {
              (currentMap.getSource(sourceId) as maplibregl.GeoJSONSource).setData(parsedGeoJSON);
            } else {
              currentMap.addSource(sourceId, { type: 'geojson', data: parsedGeoJSON });
              currentMap.addLayer({
                id: sourceId,
                type: 'line',
                source: sourceId,
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': color, 'line-width': 5, 'line-opacity': 0.8 }
              }, destMarker.current ? undefined : undefined);
            }
          } catch (e) { console.error("GeoJSON parse error", e); }
        } else {
          if (currentMap.getSource(sourceId)) {
             (currentMap.getSource(sourceId) as maplibregl.GeoJSONSource).setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } });
          }
        }
      });
    };

    if (currentMap.isStyleLoaded()) {
      drawRoutes();
    } else {
      currentMap.once('styledata', drawRoutes);
    }
  }, [participants, destination]);

  // 8. Global Message Notifications
  useEffect(() => {
    if (!roomId) return;
    if (isChatOpen) {
      setUnreadCount(0);
      setLatestMessage(null);
      return;
    }

    const q = query(collection(db, `rooms/${roomId}/messages`), orderBy('createdAt', 'desc'), limit(1));
    let isFirstLoad = true;

    const unsub = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) return;
      const docData = snapshot.docs[0];
      const data = docData.data();
      
      if (isFirstLoad) {
        isFirstLoad = false;
        return;
      }
      
      if (data.senderId !== user?.uid && !data.isSystem) {
        setUnreadCount(prev => prev + 1);
        setLatestMessage({ id: docData.id, ...data });
        
        setTimeout(() => {
          setLatestMessage((curr: any) => curr?.id === docData.id ? null : curr);
        }, 4000);
      }
    });

    return () => unsub();
  }, [roomId, isChatOpen, user]);

  const forceRefreshLocation = () => {
    if ("geolocation" in navigator && user && roomId) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            await updateDoc(doc(db, `rooms/${roomId}/participants`, user.uid), {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              lastActive: serverTimestamp(),
            });
            if (map.current) {
              map.current.flyTo({ center: [position.coords.longitude, position.coords.latitude], zoom: 15, duration: 1500 });
            }
          } catch (e) { console.error("Refresh location failed", e); }
        },
        (e) => console.error(e),
        { enableHighAccuracy: true, maximumAge: 0 }
      );
    }
  };

  const flyToUser = (lat: number, lng: number) => {
    if (map.current && lat && lng) {
      map.current.flyTo({ center: [lng, lat], zoom: 15, duration: 1500 });
    }
  };

  const formatETA = (seconds?: number) => {
    if (seconds === undefined) return null;
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins} min drive`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${remMins}m drive`;
  };

  const copyInvite = () => {
    if (!roomId) return;
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleKickUser = async (uid: string) => {
    if (!isHost || !roomId) return;
    if (confirm("Remove this user from the group?")) {
      await deleteDoc(doc(db, `rooms/${roomId}/participants`, uid));
    }
  };

  const handleDeleteGroup = async () => {
    if (!roomId) return;
    if (confirm("Are you sure you want to end this session for everyone?")) {
      await deleteDoc(doc(db, 'rooms', roomId));
    }
  };
  
  const handleLeaveGroup = async () => {
    if (!roomId || !user) return;
    if (confirm("Leave this group?")) {
      await deleteDoc(doc(db, `rooms/${roomId}/participants`, user.uid));
      router.push('/lobby');
    }
  };

  if (loadingAccess) {
    return (
      <ProtectedRoute>
        <div className="h-screen bg-[#F8FAFC] flex items-center justify-center">
           <Loader2 className="animate-spin text-[#0284C7]" size={32} />
        </div>
      </ProtectedRoute>
    );
  }

  if (!isApproved) {
    return (
      <ProtectedRoute>
        <div className="h-screen bg-[#F8FAFC] flex flex-col items-center justify-center relative overflow-hidden px-6">
          <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-sky-500/5 rounded-full blur-[100px]" />
          <div className="bg-[#FFFFFF]/80 backdrop-blur-xl border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[32px] p-10 max-w-md w-full text-center z-10">
            <div className="w-16 h-16 bg-gradient-to-tr from-sky-50 to-white text-[#0284C7] rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm border border-slate-100">
              <Loader2 size={28} className="animate-spin" />
            </div>
            <h2 className="text-[28px] font-semibold tracking-[-0.02em] text-[#1E293B] mb-3">Pending Approval</h2>
            <p className="text-[15px] font-medium text-[#475569] leading-relaxed">
              We've sent a request to the Group Leader. You'll be admitted as soon as they accept.
            </p>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (!hasLocation) {
    return (
      <ProtectedRoute>
        <div className="h-screen bg-[#F8FAFC] flex items-center justify-center p-6 relative overflow-hidden">
          <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-sky-500/5 rounded-full blur-[100px]" />
          <div className="bg-[#FFFFFF]/80 backdrop-blur-xl border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[32px] p-10 max-w-md w-full text-center z-10">
            <div className="w-16 h-16 rounded-full bg-sky-50 flex items-center justify-center mx-auto mb-6 relative border border-white shadow-sm">
              <div className="absolute inset-0 rounded-full bg-[#0284C7]/20 animate-ping" />
              <Navigation size={28} className="text-[#0284C7] relative z-10" />
            </div>
            <h2 className="text-[28px] font-semibold tracking-[-0.02em] text-[#1E293B] mb-3">Locating You</h2>
            {locationError ? (
              <div className="bg-rose-50/80 backdrop-blur-sm text-rose-600 px-4 py-3 rounded-2xl text-[14px] font-medium border border-rose-100">{locationError}</div>
            ) : (
              <p className="text-[15px] font-medium text-[#475569] leading-relaxed">
                Please allow location access so we can place you on the map and find the optimal Gravity Center.
              </p>
            )}
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      {/* 
        Dashboard Layout 
        pt-[104px] clears the global fixed Navbar (top-6 + h-16) perfectly 
      */}
      <div className="h-screen bg-[#F8FAFC] pt-[104px] pb-6 px-6 flex flex-col overflow-hidden relative">
        
        {/* Global Toast Notification */}
        {latestMessage && !isChatOpen && (
          <div className="fixed top-28 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-4 fade-in duration-300">
            <div onClick={() => setIsChatOpen(true)} className="bg-white/90 backdrop-blur-xl border border-slate-200 shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-2xl p-3 pr-5 flex items-center gap-3 cursor-pointer hover:bg-white transition-all hover:scale-105 active:scale-95 group">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#0284C7] to-[#0369A1] flex items-center justify-center text-white font-bold text-[14px] shadow-sm">
                 {latestMessage.senderName.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col">
                <span className="text-[12px] font-bold text-[#1E293B] flex items-center gap-1.5">
                  {latestMessage.senderName}
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0284C7]"></span>
                </span>
                <span className="text-[13px] text-[#475569] font-medium max-w-[220px] truncate group-hover:text-[#0284C7] transition-colors">{latestMessage.text}</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col lg:flex-row gap-6 h-full min-h-0 w-full max-w-[1600px] mx-auto">
          
          {/* Left Column - Planning & Session Details */}
          <div className="w-full lg:w-[320px] shrink-0 flex flex-col gap-4 h-full">
            
            {/* Session Token Card */}
            <div className="bg-white border border-slate-200 shadow-sm rounded-3xl p-5 shrink-0 relative group/card">
              {isHost ? (
                <button onClick={handleDeleteGroup} className="absolute top-4 right-4 text-slate-300 hover:text-rose-600 transition-colors p-1" title="End Session">
                  <Trash2 size={16} />
                </button>
              ) : (
                <button onClick={handleLeaveGroup} className="absolute top-4 right-4 text-slate-300 hover:text-rose-600 transition-colors p-1" title="Leave Session">
                  <LogOut size={16} />
                </button>
              )}
              <div className="flex items-center justify-between mb-2.5 px-1 pr-6">
                <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-[0.15em] truncate">{roomName || 'Group Session'}</p>
                <button onClick={() => setShowToken(!showToken)} className="text-[#64748B] hover:text-[#0284C7] transition-colors" title="Toggle Token">
                  {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <div 
                onClick={copyInvite}
                className="group relative bg-[#F8FAFC] border border-slate-200 rounded-[20px] p-3.5 flex items-center justify-between cursor-pointer hover:bg-white hover:border-[#0284C7]/30 hover:shadow-sm transition-all"
              >
                <div className="text-[22px] font-bold tracking-[0.2em] text-[#1E293B] font-mono">
                  {showToken ? roomId : '••••••'}
                </div>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-sm ${copied ? 'bg-emerald-100 text-emerald-600' : 'bg-white text-[#64748B] group-hover:text-[#0284C7]'}`}>
                  {copied ? <CheckCircle2 size={18} /> : <Copy size={16} />}
                </div>
              </div>
            </div>

            {/* Destination Planning Card */}
            <div className="bg-white border border-slate-200 shadow-sm rounded-3xl p-5 shrink-0 flex flex-col z-20">
              <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-[0.15em] mb-3">Trip Planning</p>
              
              {isHost && (
                <div className="relative mb-3">
                  <form onSubmit={handleSearch} className="relative">
                    <input 
                      type="text" 
                      value={searchQuery} 
                      onChange={(e) => setSearchQuery(e.target.value)} 
                      placeholder="Search destination..." 
                      className="w-full text-[13px] font-medium bg-[#F8FAFC] border border-slate-200 rounded-xl py-2.5 pl-3 pr-10 outline-none focus:bg-white focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/10 transition-all text-[#1E293B] placeholder-[#94A3B8]"
                    />
                    <button type="submit" disabled={isSearching} className="absolute right-2 top-2 bottom-2 text-[#64748B] hover:text-[#0284C7] transition-colors disabled:opacity-50">
                      {isSearching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                    </button>
                  </form>
                  <button
                    onClick={computeGravityCenter}
                    disabled={isComputing || participants.length < 2}
                    className="mt-2.5 w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white rounded-xl py-2.5 text-[13px] font-semibold transition-all disabled:opacity-50 disabled:grayscale shadow-[0_4px_12px_rgba(99,102,241,0.25)] border border-indigo-400/50 hover:shadow-[0_6px_16px_rgba(99,102,241,0.35)]"
                    title="Calculate the exact midpoint of all members and find a venue"
                  >
                    {isComputing ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                    Auto-Compute Gravity Center
                  </button>

                  {searchResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-xl mt-1.5 max-h-48 overflow-y-auto z-30 shadow-[0_10px_25px_rgba(0,0,0,0.05)] custom-scrollbar">
                      {searchResults.map((r, i) => (
                        <div 
                          key={i} 
                          onClick={() => selectSearchResult(r)} 
                          className="p-3 text-[12px] font-medium text-[#475569] cursor-pointer hover:bg-sky-50 hover:text-[#0284C7] border-b border-slate-50 last:border-0 transition-colors line-clamp-2"
                        >
                          {r.display_name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className={`rounded-[20px] p-4 text-center border transition-colors ${destination ? 'bg-rose-50/50 border-rose-100' : 'bg-[#F8FAFC] border-slate-200'}`}>
                {destination ? (
                  <>
                    <div className="flex items-center justify-center gap-2 text-rose-500 mb-1.5">
                      <MapPin size={18} />
                      <span className="font-semibold text-[14px]">Destination Set</span>
                    </div>
                    {(destination as any).name && (
                      <p className="text-[12px] font-medium text-rose-600 mb-1.5 line-clamp-2 px-2" title={(destination as any).name}>{(destination as any).name}</p>
                    )}
                    <button 
                      onClick={() => flyToUser(destination.lat, destination.lng)} 
                      className="text-[11px] font-bold text-rose-600 bg-rose-100/80 px-3 py-1.5 rounded-full mt-1.5 hover:bg-rose-200 transition-colors shadow-sm inline-flex items-center gap-1.5"
                    >
                      <Navigation size={12} />
                      Locate Pin
                    </button>
                    {isHost && <p className="text-[10px] font-medium text-rose-600/60 mt-2">Search or click map to update.</p>}
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-center gap-2 text-[#0284C7] mb-1.5">
                      <Navigation size={18} />
                      <span className="font-semibold text-[14px]">No Destination</span>
                    </div>
                    {isHost ? (
                      <p className="text-[12px] font-medium text-sky-700/70">Search or click map to set spot.</p>
                    ) : (
                      <p className="text-[12px] font-medium text-slate-500">Waiting for leader...</p>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Active Members Card */}
            <div className="bg-white border border-slate-200 shadow-sm rounded-3xl flex-1 min-h-0 flex flex-col overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white z-10">
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-[#0284C7]" />
                  <p className="text-[14px] font-bold text-[#1E293B]">Active Members</p>
                </div>
                <span className="bg-sky-50 text-[#0284C7] text-[11px] font-bold px-2 py-0.5 rounded-full">{participants.length}</span>
              </div>
              
              <div className="flex-1 overflow-y-auto p-3 custom-scrollbar bg-[#F8FAFC]">
                <div className="space-y-1">
                  {participants.map((p) => (
                    <div 
                      key={p.id} 
                      onClick={() => flyToUser(p.lat, p.lng)}
                      className="flex items-center gap-3.5 p-2.5 rounded-[20px] bg-white border border-transparent hover:border-slate-200 hover:shadow-sm cursor-pointer transition-all"
                    >
                      <div className="relative shrink-0">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-[14px] border border-slate-200 overflow-hidden" style={{ backgroundColor: getUserColor(p.id) }}>
                          {p.name.charAt(0).toUpperCase()}
                        </div>
                        <div className={`absolute bottom-0 right-0 w-3 h-3 ${p.isOnline !== false ? 'bg-[#10B981]' : 'bg-slate-300'} border-2 border-white rounded-full`}></div>
                      </div>
                      <div className="flex-1 min-w-0 pr-2">
                        <p className="font-semibold text-[14px] text-[#1E293B] truncate">
                          {p.id === user?.uid ? `${p.name} (You)` : p.name}
                        </p>
                        {destination && p.distanceToDestination !== undefined ? (
                          <p className="text-[12px] font-medium text-[#0284C7] mt-0.5 flex items-center gap-1.5">
                            {p.eta !== undefined && (
                              <span className="bg-sky-50 px-2 py-0.5 rounded-md border border-sky-100">{formatETA(p.eta)}</span>
                            )}
                            <span className={p.eta !== undefined ? "text-slate-400" : ""}>
                              {p.eta !== undefined ? `(${p.distanceToDestination.toFixed(1)} km)` : `${p.distanceToDestination.toFixed(1)} km away`}
                            </span>
                          </p>
                        ) : (
                          <p className="text-[12px] text-[#64748B] truncate">
                            {p.lat ? 'Location Shared' : 'Connecting...'}
                          </p>
                        )}
                      </div>
                      {isHost && p.id !== user?.uid && (
                        <button onClick={() => handleKickUser(p.id)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 hover:bg-rose-50 hover:text-rose-600 transition-colors shrink-0" title="Remove User">
                          <UserMinus size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
          
          {/* Center Column - Live Map */}
          <div className="flex-1 bg-slate-100 border border-slate-200 shadow-sm rounded-3xl relative overflow-hidden min-h-[400px]">
            <div ref={mapContainer} className="absolute inset-0 w-full h-full" />
            
            {/* Minimal Map Overlay Label */}
            <div className="absolute top-4 left-4 z-10 flex gap-2">
              <div className="bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow-sm border border-slate-200 flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                <span className="text-[12px] font-semibold text-[#1E293B]">Live Map</span>
              </div>
              <button 
                onClick={forceRefreshLocation}
                className="bg-white/90 backdrop-blur-md px-2.5 py-1.5 rounded-full shadow-sm border border-slate-200 flex items-center gap-1.5 hover:bg-white transition-colors"
                title="Force refresh my location"
              >
                <RefreshCcw size={12} className="text-[#0284C7]" />
                <span className="text-[12px] font-semibold text-[#1E293B]">Refresh</span>
              </button>
            </div>
          </div>

          {/* Right Column - Chat Panel */}
          {isChatOpen ? (
            <div className="w-full lg:w-[340px] shrink-0 h-full hidden lg:block animate-in slide-in-from-right-4 fade-in">
              {roomId && <ChatPanel roomId={roomId} isPermanent={true} onClose={() => setIsChatOpen(false)} />}
            </div>
          ) : (
            <div className="hidden lg:flex flex-col justify-end pb-4 h-full shrink-0">
              <button 
                onClick={() => setIsChatOpen(true)} 
                className="bg-white border border-slate-200 shadow-sm p-4 rounded-3xl flex items-center justify-center text-[#0284C7] hover:bg-sky-50 transition-colors relative"
                title="Open Group Chat"
              >
                <MessageCircle size={24} />
                {unreadCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-rose-500 text-white text-[11px] font-bold w-6 h-6 flex items-center justify-center rounded-full border-2 border-[#F8FAFC] shadow-sm animate-in zoom-in">
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>
          )}

        </div>

        {/* Mobile floating chat button */}
        <div className="lg:hidden z-50">
          {roomId && <ChatPanel roomId={roomId} isPermanent={false} />}
        </div>
        
      </div>
    </ProtectedRoute>
  );
}
