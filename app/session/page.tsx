'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useRoom } from '@/context/RoomContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import ChatPanel from '@/components/ChatPanel';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, onSnapshot, serverTimestamp, deleteDoc, getDoc, updateDoc, addDoc, query, orderBy, limit } from 'firebase/firestore';
import { Copy, Navigation, CheckCircle2, Loader2, MapPin, Users, Eye, EyeOff, MessageCircle, UserMinus, Trash2, LogOut, Search, RefreshCcw, Zap, Car, Bike, Footprints, Coffee, Utensils, Trees, Sparkles, Compass, ExternalLink, X, Check } from 'lucide-react';
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
  transitMode?: 'driving' | 'cycling' | 'walking';
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
  name?: string;
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
  const [sidebarTab, setSidebarTab] = useState<'members' | 'planner'>('members');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  
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

    const preferredTransitMode = localStorage.getItem('grouproute_transit_mode') || 'driving';

    const updateLocation = async (lat: number, lng: number) => {
      try {
        if (isInitialJoin) {
          await setDoc(doc(db, `rooms/${roomId}/participants`, user.uid), {
            name: user.displayName || 'Guest',
            lat,
            lng,
            transitMode: preferredTransitMode,
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
          const mode = currentUser.transitMode || 'driving';
          let baseUrl = 'https://router.project-osrm.org/route/v1/driving/';
          if (mode === 'walking') {
            baseUrl = 'https://routing.openstreetmap.de/routed-foot/route/v1/driving/';
          } else if (mode === 'cycling') {
            baseUrl = 'https://routing.openstreetmap.de/routed-bike/route/v1/driving/';
          } else {
            baseUrl = 'https://routing.openstreetmap.de/routed-car/route/v1/driving/';
          }
          const url = `${baseUrl}${currentUser.lng},${currentUser.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
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

  // 8.5 Smoothly resize map during chat toggle transitions
  useEffect(() => {
    if (!map.current) return;
    const interval = setInterval(() => {
      if (map.current) map.current.resize();
    }, 16); // ~60fps
    
    const timeout = setTimeout(() => {
      clearInterval(interval);
      if (map.current) map.current.resize();
    }, 600); // slightly longer than CSS transition
    
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isChatOpen]);

  const forceRefreshLocation = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setRefreshError(null);

    if (!("geolocation" in navigator) || !user || !roomId) {
      setRefreshError("Geolocation is not supported by your browser.");
      setIsRefreshing(false);
      return;
    }

    const handleSuccess = async (position: GeolocationPosition) => {
      try {
        const { latitude, longitude } = position.coords;
        await updateDoc(doc(db, `rooms/${roomId}/participants`, user.uid), {
          lat: latitude,
          lng: longitude,
          lastActive: serverTimestamp(),
        });
        if (map.current) {
          map.current.flyTo({ 
            center: [longitude, latitude], 
            zoom: 15.5, 
            duration: 2000,
            essential: true
          });
        }
      } catch (e) {
        console.error("Refresh location failed", e);
        setRefreshError("Failed to update database.");
      } finally {
        setTimeout(() => setIsRefreshing(false), 1200);
      }
    };

    const handleFailure = (fallbackError: GeolocationPositionError) => {
      console.error("Standard geolocation failed too:", fallbackError);
      let msg = "Could not retrieve your location.";
      if (fallbackError.code === 1) {
        msg = "Permission denied. Check browser location settings.";
      } else if (fallbackError.code === 2) {
        msg = "Position unavailable. Verify device location settings.";
      } else if (fallbackError.code === 3) {
        msg = "Request timed out. Please try again.";
      }
      setRefreshError(msg);
      setIsRefreshing(false);
      setTimeout(() => setRefreshError(null), 5000);
    };

    // Attempt with high accuracy first (allowing 10s cached data), falling back to standard accuracy (allowing 30s cached data)
    navigator.geolocation.getCurrentPosition(
      handleSuccess,
      (error) => {
        console.warn("High accuracy geolocation failed, trying standard accuracy...", error);
        navigator.geolocation.getCurrentPosition(
          handleSuccess,
          handleFailure,
          { enableHighAccuracy: false, maximumAge: 30000, timeout: 10000 }
        );
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 6000 }
    );
  };

  const handleClearDestination = async () => {
    if (!isHost || !roomId) return;
    try {
      await updateDoc(doc(db, 'rooms', roomId), { 
        destination: null 
      });
    } catch (error) {
      console.error("Failed to clear destination", error);
    }
  };

  const flyToUser = (lat: number, lng: number) => {
    if (map.current && lat && lng) {
      map.current.flyTo({ center: [lng, lat], zoom: 15, duration: 1500 });
    }
  };

  const formatETA = (seconds?: number, mode?: string) => {
    if (seconds === undefined) return null;
    const mins = Math.round(seconds / 60);
    const label = mode === 'walking' ? 'walk' :
                  mode === 'bicycling' ? 'cycle' :
                  mode === 'transit' ? 'transit' : 'drive';
    if (mins < 60) return `${mins} min ${label}`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${remMins}m ${label}`;
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

        {/* Geolocation Refresh Error Toast */}
        {refreshError && (
          <div className="fixed top-28 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-top-4 fade-in duration-300">
            <div className="bg-white/95 backdrop-blur-xl border border-rose-200 shadow-[0_8px_30px_rgba(225,29,72,0.1)] rounded-2xl p-3 px-5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-500 shrink-0">
                <X size={15} />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[12px] font-bold text-rose-600">Location Refresh Failed</span>
                <span className="text-[12px] text-slate-500 font-semibold">{refreshError}</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col lg:flex-row gap-6 h-full min-h-0 w-full max-w-[1600px] mx-auto">
          
          {/* Left Column - Planning & Session Details */}
          <div className="w-full lg:w-[320px] shrink-0 flex flex-col gap-4 h-full">
            
            {/* Sidebar Header: Room Name, Token, & Host controls */}
            <div className="flex items-center justify-between px-1 shrink-0">
              <div className="flex flex-col min-w-0">
                <h2 className="text-[16px] font-black text-slate-900 tracking-tight truncate leading-tight">
                  {roomName || 'Group Session'}
                </h2>
                
                {/* Space-efficient Token display */}
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[11px] font-mono font-bold bg-slate-100 text-slate-650 px-1.5 py-0.5 rounded border border-slate-200 uppercase tracking-wider">
                    Code: {showToken ? roomId : '••••••'}
                  </span>
                  <button onClick={() => setShowToken(!showToken)} className="text-slate-400 hover:text-indigo-600 transition-colors p-0.5 animate-in fade-in" title="Toggle Token">
                    {showToken ? <EyeOff size={11} /> : <Eye size={11} />}
                  </button>
                  <button onClick={copyInvite} className={`text-slate-400 hover:text-indigo-600 transition-colors p-0.5 ${copied ? 'text-emerald-600 hover:text-emerald-700' : ''}`} title="Copy Code">
                    {copied ? <CheckCircle2 size={11} /> : <Copy size={11} />}
                  </button>
                </div>
              </div>

              {/* End/Leave controls */}
              <div className="flex items-center shrink-0">
                {isHost ? (
                  <button onClick={handleDeleteGroup} className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-full transition-all" title="End Session">
                    <Trash2 size={15} />
                  </button>
                ) : (
                  <button onClick={handleLeaveGroup} className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-full transition-all" title="Leave Session">
                    <LogOut size={15} />
                  </button>
                )}
              </div>
            </div>

            {/* Segmented Tab Switcher */}
            <div className="relative w-full h-[40px] bg-slate-100 rounded-xl p-0.5 flex items-center border border-slate-200 z-10 text-xs shrink-0">
              <div
                className="absolute top-0.5 bottom-0.5 w-[calc(50%-2px)] bg-white rounded-lg shadow-sm border border-slate-200 transition-all duration-400 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
                style={{ transform: sidebarTab === 'members' ? 'translateX(0)' : 'translateX(100%)' }}
              />
              <button
                onClick={() => setSidebarTab('members')}
                className={`flex-grow h-full rounded-lg font-bold z-10 transition-colors duration-200 ${sidebarTab === 'members' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}
              >
                <span className="flex items-center gap-1.5 justify-center">
                  <Users size={13} className={sidebarTab === 'members' ? 'text-[#0284C7]' : 'text-slate-400'} />
                  Members ({participants.length})
                </span>
              </button>
              <button
                onClick={() => setSidebarTab('planner')}
                className={`flex-grow h-full rounded-lg font-bold z-10 transition-colors duration-200 ${sidebarTab === 'planner' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}
              >
                <span className="flex items-center gap-1.5 justify-center">
                  <Compass size={13} className={sidebarTab === 'planner' ? 'text-[#0284C7]' : 'text-slate-400'} />
                  Trip Planner {destination ? '•' : ''}
                </span>
              </button>
            </div>

            {/* Tab Panels with Custom 3D perspective flip transition */}
            <div className="relative flex-1 min-h-0 w-full [perspective:1200px] z-0">
              <div 
                className={`relative w-full h-full [transform-style:preserve-3d] transition-transform duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                  sidebarTab === 'planner' ? '[transform:rotateY(180deg)]' : ''
                }`}
              >
                
                {/* Front Face: Active Members */}
                <div 
                  className={`absolute inset-0 w-full h-full flex flex-col [backface-visibility:hidden] [-webkit-backface-visibility:hidden] ${
                    sidebarTab === 'members' ? 'pointer-events-auto z-10' : 'pointer-events-none z-0'
                  }`}
                >
                  <div className="bg-white border border-slate-200 shadow-sm rounded-3xl flex-1 min-h-0 flex flex-col overflow-hidden">
                    <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white z-10">
                      <div className="flex items-center gap-2">
                        <Users size={16} className="text-[#0284C7]" />
                        <p className="text-[14px] font-bold text-[#1E293B]">Active Members</p>
                      </div>
                      <span className="bg-sky-50 text-[#0284C7] text-[11px] font-bold px-2 py-0.5 rounded-full">{participants.length}</span>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-3 custom-scrollbar bg-[#F8FAFC]">
                      <div className="space-y-2.5">
                        {participants.map((p) => {
                          const isArrived = destination && p.distanceToDestination !== undefined && p.distanceToDestination < 0.05;
                          const userColor = getUserColor(p.id);
                          
                          return (
                            <div 
                              key={p.id} 
                              onClick={() => flyToUser(p.lat, p.lng)}
                              style={{ borderLeft: `4px solid ${userColor}` }}
                              className="group/member bg-white border border-slate-200 rounded-2xl p-3 cursor-pointer transition-all duration-200 hover:border-slate-350 hover:shadow-md active:scale-[0.99] flex flex-col gap-2 relative overflow-hidden"
                            >
                              {/* Member Row Header */}
                              <div className="flex items-center justify-between gap-2.5">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  {/* Avatar */}
                                  <div className="relative shrink-0">
                                    <div 
                                      className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-[12px] border border-white/20 shadow-xs"
                                      style={{ backgroundColor: userColor }}
                                    >
                                      {p.name.charAt(0).toUpperCase()}
                                    </div>
                                    <span 
                                      className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${p.isOnline !== false ? 'bg-emerald-500' : 'bg-slate-300'}`} 
                                    />
                                  </div>

                                  {/* Name */}
                                  <div className="min-w-0">
                                    <h4 className="font-bold text-[13px] text-slate-800 truncate leading-tight flex items-center gap-1.5">
                                      {p.id === user?.uid ? `${p.name} (You)` : p.name}
                                    </h4>
                                  </div>
                                </div>

                                {/* Transit Indicator Pill */}
                                <div className="shrink-0">
                                  {p.transitMode === 'walking' && (
                                    <span className="flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md border border-emerald-100">
                                      <Footprints size={10} /> Walk
                                    </span>
                                  )}
                                  {p.transitMode === 'cycling' && (
                                    <span className="flex items-center gap-1 bg-sky-50 text-sky-700 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md border border-sky-100">
                                      <Bike size={10} /> Cycle
                                    </span>
                                  )}
                                  {p.transitMode === 'driving' && (
                                    <span className="flex items-center gap-1 bg-indigo-50 text-indigo-700 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md border border-indigo-100">
                                      <Car size={10} /> Drive
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Location / Destination Stats */}
                              <div className="flex items-center justify-between mt-0.5">
                                {destination && p.distanceToDestination !== undefined ? (
                                  <>
                                    {isArrived ? (
                                      <span className="flex items-center gap-1.5 text-[10px] font-extrabold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100">
                                        <Sparkles size={11} className="text-emerald-500" /> Arrived
                                      </span>
                                    ) : (
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        {p.eta !== undefined && (
                                          <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-1.5 py-0.5 rounded-md border border-slate-200">
                                            {formatETA(p.eta, p.transitMode)}
                                          </span>
                                        )}
                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                          {p.distanceToDestination.toFixed(1)} km away
                                        </span>
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-[10px] text-slate-400 font-medium">
                                    {p.lat ? 'Location shared' : 'Waiting for connection...'}
                                  </span>
                                )}

                                {/* Actions: Locate or Kick */}
                                <div className="flex items-center gap-1 opacity-0 group-hover/member:opacity-100 transition-opacity">
                                  <Navigation size={11} className="text-slate-400 group-hover/member:text-indigo-600 transition-colors" />
                                  {isHost && p.id !== user?.uid && (
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleKickUser(p.id);
                                      }}
                                      className="text-slate-300 hover:text-rose-600 p-0.5 transition-colors"
                                      title="Remove User"
                                    >
                                      <UserMinus size={12} />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Visual trip progress bar if en route */}
                              {destination && p.distanceToDestination !== undefined && !isArrived && (
                                <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden mt-1 opacity-80">
                                  <div 
                                    className="h-full rounded-full transition-all duration-300"
                                    style={{ 
                                      width: `${Math.max(10, Math.min(95, 100 - (p.distanceToDestination * 10)))}%`,
                                      backgroundColor: userColor
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Back Face: Trip Planner */}
                <div 
                  className={`absolute inset-0 w-full h-full flex flex-col [backface-visibility:hidden] [-webkit-backface-visibility:hidden] [transform:rotateY(180deg)] ${
                    sidebarTab === 'planner' ? 'pointer-events-auto z-10' : 'pointer-events-none z-0'
                  }`}
                >
                  <div className="bg-white border border-slate-200 shadow-sm rounded-3xl flex-1 min-h-0 flex flex-col overflow-hidden">
                    <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white z-10">
                      <div className="flex items-center gap-2">
                        <MapPin size={16} className="text-[#0284C7]" />
                        <p className="text-[14px] font-bold text-[#1E293B]">Trip Planner</p>
                      </div>
                      {destination && (
                        <span className="bg-rose-50 text-rose-600 text-[11px] font-bold px-2 py-0.5 rounded-full">Set</span>
                      )}
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-[#F8FAFC] flex flex-col gap-4">
                      {isHost && (
                        <div className="relative mb-1">
                          <form onSubmit={handleSearch} className="relative">
                            <input 
                              type="text" 
                              value={searchQuery} 
                              onChange={(e) => setSearchQuery(e.target.value)} 
                              placeholder="Search destination..." 
                              className="w-full text-[13px] font-medium bg-white border border-slate-200 rounded-xl py-2.5 pl-3 pr-10 outline-none focus:bg-white focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/10 transition-all text-[#1E293B] placeholder-[#94A3B8]"
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

                      <div className={`rounded-[24px] p-5 border transition-all duration-300 ${destination ? 'bg-white border-slate-200 shadow-md' : 'bg-white border-slate-200 shadow-sm'}`}>
                        {destination ? (
                          <div className="flex flex-col text-left">
                            <div className="flex items-center gap-2.5 mb-3">
                              <div className="w-10 h-10 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-500 shrink-0">
                                <MapPin size={18} className="animate-pulse" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest leading-none">Destination</p>
                                <h4 className="text-[13px] font-bold text-slate-800 mt-1 truncate leading-tight">
                                  {(destination as any).name ? (destination as any).name.split(':')[0] : 'Set Location'}
                                </h4>
                              </div>
                            </div>
                            
                            {(destination as any).name && (
                              <p className="text-[12px] font-medium text-slate-500 mb-3 px-1 leading-normal line-clamp-2" title={(destination as any).name}>
                                {(destination as any).name}
                              </p>
                            )}

                            {/* Coordinates badges */}
                            <div className="flex items-center gap-2 mb-4 px-1">
                              <span className="bg-slate-50 text-slate-500 text-[10px] font-mono font-bold px-2 py-1 rounded-md border border-slate-100">
                                Lat: {destination.lat.toFixed(4)}
                              </span>
                              <span className="bg-slate-50 text-slate-500 text-[10px] font-mono font-bold px-2 py-1 rounded-md border border-slate-100">
                                Lng: {destination.lng.toFixed(4)}
                              </span>
                            </div>

                            {/* Action Buttons Grid */}
                            <div className="flex flex-col gap-2">
                              <div className="grid grid-cols-2 gap-2">
                                <button 
                                  onClick={() => flyToUser(destination.lat, destination.lng)} 
                                  className="text-[11px] font-bold text-[#0284C7] bg-sky-50 hover:bg-sky-100 px-3 py-2.5 rounded-xl border border-sky-100/50 transition-colors shadow-xs inline-flex items-center justify-center gap-1.5 active:scale-[0.98]"
                                >
                                  <Navigation size={12} />
                                  Locate Pin
                                </button>
                                <a
                                  href={`https://www.google.com/maps/search/?api=1&query=${destination.lat},${destination.lng}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[11px] font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 px-3 py-2.5 rounded-xl border border-slate-200 transition-colors shadow-xs inline-flex items-center justify-center gap-1.5 active:scale-[0.98] no-underline"
                                >
                                  <ExternalLink size={12} />
                                  Open in Maps
                                </a>
                              </div>

                              {isHost && (
                                <button
                                  onClick={handleClearDestination}
                                  className="w-full text-[11px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 px-3 py-2.5 rounded-xl border border-rose-100 transition-colors shadow-xs inline-flex items-center justify-center gap-1.5 active:scale-[0.98] mt-1"
                                >
                                  <X size={12} />
                                  Clear Destination
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center text-center py-4">
                            <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-[#0284C7] mb-3">
                              <Compass size={22} className="text-slate-400" />
                            </div>
                            <h4 className="font-bold text-[14px] text-slate-800">No Destination Set</h4>
                            {isHost ? (
                              <p className="text-[12px] font-medium text-slate-400 mt-1.5 max-w-[200px] leading-relaxed">Search above or click anywhere on the map to set a meeting spot.</p>
                            ) : (
                              <p className="text-[12px] font-medium text-slate-400 mt-1.5">Waiting for the Group Leader to choose a destination...</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
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
                disabled={isRefreshing}
                className="bg-white/90 backdrop-blur-md px-2.5 py-1.5 rounded-full shadow-sm border border-slate-200 flex items-center gap-1.5 hover:bg-white transition-colors disabled:opacity-70"
                title="Force refresh my location"
              >
                <RefreshCcw size={12} className={`text-[#0284C7] ${isRefreshing ? 'animate-spin' : ''}`} />
                <span className="text-[12px] font-semibold text-[#1E293B]">{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
              </button>
            </div>
          </div>

          {/* Right Column - Chat Panel with smooth transition */}
          <div 
            className="hidden lg:block shrink-0 h-full relative transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
            style={{ width: isChatOpen ? '340px' : '58px' }}
          >
            {/* Chat Panel Wrapper */}
            <div 
              className={`absolute top-0 right-0 w-[340px] h-full transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] origin-right ${
                isChatOpen 
                  ? 'opacity-100 scale-100 pointer-events-auto' 
                  : 'opacity-0 scale-95 pointer-events-none'
              }`}
            >
              {roomId && (
                <ChatPanel 
                  roomId={roomId} 
                  isPermanent={true} 
                  onClose={() => setIsChatOpen(false)} 
                />
              )}
            </div>

            {/* Toggle Button Wrapper */}
            <div 
              className={`absolute bottom-4 right-0 w-[58px] h-[58px] transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                !isChatOpen 
                  ? 'opacity-100 scale-100 pointer-events-auto' 
                  : 'opacity-0 scale-90 pointer-events-none'
              }`}
            >
              <button 
                onClick={() => setIsChatOpen(true)} 
                className="w-full h-full bg-white border border-slate-200 shadow-sm rounded-3xl flex items-center justify-center text-[#0284C7] hover:bg-sky-50 transition-colors relative active:scale-95"
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
          </div>

        </div>

        {/* Mobile floating chat button */}
        <div className="lg:hidden z-50">
          {roomId && <ChatPanel roomId={roomId} isPermanent={false} />}
        </div>
        
      </div>
    </ProtectedRoute>
  );
}
