'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useRoom } from '@/context/RoomContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import {
  Plus,
  ArrowRight,
  Clock,
  MapPin,
  Navigation,
  Map,
  Search,
  Trash2,
  CheckCircle2,
  ChevronRight,
  Car,
  Bike,
  Footprints,
  Coffee,
  Utensils,
  Trees,
  Briefcase,
  Leaf,
  Sparkles,
  Users,
  UserPlus,
  EyeOff
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp, collection, query, orderBy, onSnapshot } from 'firebase/firestore';

interface RecentRoom {
  id: string;
  joinedAt: any;
  lastActive?: any;
  name?: string;
  hostId?: string;
}

interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { setRoomId } = useRoom();

  const [joinCode, setJoinCode] = useState('');
  const [groupName, setGroupName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [recentRooms, setRecentRooms] = useState<RecentRoom[]>([]);
  const [friends, setFriends] = useState<AppUser[]>([]);
  const [activeTab, setActiveTab] = useState<'create' | 'join'>('create');

  // Search, Filter and Apple Settings
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'hosted' | 'joined'>('all');

  // Travel & Transit Preferences State
  const [transitMode, setTransitMode] = useState<'driving' | 'cycling' | 'walking'>('driving');
  const [preferredCategory, setPreferredCategory] = useState<'cafes' | 'restaurants' | 'parks' | 'workspaces'>('cafes');
  const [ghostMode, setGhostMode] = useState(false);

  // Load preferences from localStorage
  useEffect(() => {
    const savedMode = localStorage.getItem('grouproute_transit_mode') as 'driving' | 'cycling' | 'walking' | null;
    const savedCategory = localStorage.getItem('grouproute_preferred_category') as 'cafes' | 'restaurants' | 'parks' | 'workspaces' | null;
    const savedGhostMode = localStorage.getItem('grouproute_ghost_mode') === 'true';
    if (savedMode) setTransitMode(savedMode);
    if (savedCategory) setPreferredCategory(savedCategory);
    setGhostMode(savedGhostMode);
  }, []);

  const handleTransitModeChange = (mode: 'driving' | 'cycling' | 'walking') => {
    setTransitMode(mode);
    localStorage.setItem('grouproute_transit_mode', mode);
  };

  const handleCategoryChange = (category: 'cafes' | 'restaurants' | 'parks' | 'workspaces') => {
    setPreferredCategory(category);
    localStorage.setItem('grouproute_preferred_category', category);
  };

  const handleGhostModeToggle = () => {
    const newMode = !ghostMode;
    setGhostMode(newMode);
    localStorage.setItem('grouproute_ghost_mode', newMode.toString());
  };

  // Fetch Friends
  useEffect(() => {
    if (!user) return;
    const qFriends = query(collection(db, `users/${user.uid}/friends`));
    const unsubscribeFriends = onSnapshot(qFriends, (snapshot) => {
      const friendsList: AppUser[] = [];
      snapshot.forEach((docSnap) => {
        friendsList.push({ uid: docSnap.id, ...docSnap.data() } as AppUser);
      });
      setFriends(friendsList);
    });
    return () => unsubscribeFriends();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, `users/${user.uid}/joinedRooms`),
      orderBy('joinedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const rooms: RecentRoom[] = [];
      snapshot.forEach((docSnap) => {
        rooms.push({ id: docSnap.id, ...docSnap.data() } as RecentRoom);
      });

      const validRooms: RecentRoom[] = [];
      for (const r of rooms) {
        try {
          const roomSnap = await getDoc(doc(db, 'rooms', r.id));
          if (roomSnap.exists()) {
            validRooms.push({
              ...r,
              name: roomSnap.data().name || 'Unnamed Group',
              hostId: roomSnap.data().hostId
            });
          } else {
            // Clean up dead room references silently
            deleteDoc(doc(db, `users/${user.uid}/joinedRooms`, r.id)).catch(() => { });
          }
        } catch (e) {
          console.error("Error checking room existence", e);
        }
      }
      setRecentRooms(validRooms);
    });

    return () => unsubscribe();
  }, [user]);

  const generateRoomCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const handleCreateRoom = async () => {
    if (!user) return;
    setIsCreating(true);
    try {
      const roomId = generateRoomCode();
      await setDoc(doc(db, 'rooms', roomId), {
        name: groupName.trim() || 'Unnamed Group',
        createdAt: serverTimestamp(),
        hostId: user.uid,
        status: 'active'
      });

      await setDoc(doc(db, `users/${user.uid}/joinedRooms`, roomId), {
        joinedAt: serverTimestamp(),
        lastActive: serverTimestamp()
      }, { merge: true });

      setRoomId(roomId);
      router.push(`/session`);
    } catch (error) {
      console.error("Error creating room:", error);
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.trim().length !== 6 || !user) return;

    setJoinError(null);
    try {
      const code = joinCode.toUpperCase();

      const roomRef = doc(db, 'rooms', code);
      const roomSnap = await getDoc(roomRef);

      if (!roomSnap.exists()) {
        setJoinError("Room not found. Check the Session Token.");
        return;
      }

      const hostId = roomSnap.data().hostId;

      if (hostId !== user.uid) {
        const notifId = `${code}_${user.uid}`;
        await setDoc(doc(db, `users/${hostId}/notifications`, notifId), {
          type: 'join_request',
          roomId: code,
          friendUid: user.uid,
          friendName: user.displayName || 'Guest',
          timestamp: serverTimestamp()
        });
      }

      await setDoc(doc(db, `users/${user.uid}/joinedRooms`, code), {
        joinedAt: serverTimestamp(),
        lastActive: serverTimestamp()
      }, { merge: true });

      setRoomId(code);
      router.push(`/session`);

    } catch (err) {
      console.error("Join error:", err);
      setJoinError("Failed to send join request.");
    }
  };

  const handleQuickInvite = async (friendId: string, friendName: string) => {
    if (!user) return;
    try {
      const roomId = generateRoomCode();
      // Create room
      await setDoc(doc(db, 'rooms', roomId), {
        name: `Room with ${friendName}`,
        createdAt: serverTimestamp(),
        hostId: user.uid,
        status: 'active'
      });

      // Add to current user's joined rooms
      await setDoc(doc(db, `users/${user.uid}/joinedRooms`, roomId), {
        joinedAt: serverTimestamp(),
        lastActive: serverTimestamp()
      }, { merge: true });

      // Send invite to friend
      const notifId = `${roomId}_${user.uid}`;
      await setDoc(doc(db, `users/${friendId}/notifications`, notifId), {
        type: 'join_request',
        roomId: roomId,
        friendUid: user.uid,
        friendName: user.displayName || 'Guest',
        timestamp: serverTimestamp()
      });

      setRoomId(roomId);
      router.push(`/session`);
    } catch (error) {
      console.error("Error creating quick invite room:", error);
    }
  };

  const handleRejoin = (code: string) => {
    setRoomId(code);
    router.push(`/session`);
  };

  const handleDeleteRecent = async (e: React.MouseEvent, roomId: string) => {
    e.stopPropagation();
    if (!user) return;
    if (confirm("Remove this session log from your history?")) {
      try {
        await deleteDoc(doc(db, `users/${user.uid}/joinedRooms`, roomId));
      } catch (err) {
        console.error("Failed to delete log:", err);
      }
    }
  };

  // Filter logs logic
  const filteredRooms = recentRooms.filter((room) => {
    const matchesSearch =
      (room.name && room.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      room.id.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterTab === 'hosted') {
      return room.hostId === user?.uid;
    } else if (filterTab === 'joined') {
      return room.hostId !== user?.uid;
    }
    return true;
  });

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-[#F5F5F7] flex flex-col items-center relative font-sans pt-28 pb-20">

        {/* Subtle Apple-style System grid overlay */}
        <div className="fixed top-0 left-0 w-full h-full pointer-events-none z-0">
          <div className="absolute inset-0 opacity-[0.015]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z' fill='%23000000' fill-opacity='1'/%3E%3C/g%3E%3C/svg%3E")`, backgroundSize: '60px 60px' }} />
        </div>

        <div className="w-full max-w-[1400px] px-4 md:px-6 z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start justify-center">

          {/* LEFT COLUMN: Travel Profile & Friends (3 Columns) */}
          <div className="lg:col-span-3 flex flex-col gap-6 w-full lg:mt-8 lg:order-1 order-2">


            {/* Travel Profile Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-full bg-slate-100 text-slate-800 font-bold flex items-center justify-center border border-slate-200 text-[15px]">
                  {user?.displayName?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-slate-400 uppercase tracking-wider leading-none">Traveler Profile</p>
                  <h3 className="text-[16px] font-bold text-slate-900 mt-1 leading-tight">{user?.displayName || 'Welcome Back'}</h3>
                </div>
              </div>
            </div>

            {/* Friends / Contacts Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.02)] flex flex-col h-[280px]">
              <h3 className="text-[14px] font-bold text-slate-900 mb-1.5 flex items-center gap-2">
                <Users size={15} className="text-indigo-500" />
                Friends & Contacts
              </h3>
              <p className="text-[11px] text-slate-500 font-medium mb-3.5 leading-relaxed">
                Quickly start a session with other travelers.
              </p>

              <div className="flex-1 overflow-y-auto pr-1 -mr-1 space-y-2.5">
                {friends.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-4">
                    <UserPlus size={24} className="text-slate-300 mb-2" />
                    <p className="text-xs text-slate-400 font-medium px-4">Join a session to meet travelers and add friends</p>
                  </div>
                ) : (
                  friends.map((friend) => (
                    <div key={friend.uid} className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 bg-slate-50 hover:bg-white hover:border-slate-200 hover:shadow-sm transition-all group">
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-700 font-bold flex items-center justify-center border border-indigo-100 text-xs shrink-0">
                          {friend.displayName?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-bold text-slate-800 truncate leading-tight">{friend.displayName}</p>
                          <p className="text-[10px] font-medium text-slate-400 truncate">{friend.email}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleQuickInvite(friend.uid, friend.displayName || 'Guest')}
                        className="opacity-0 group-hover:opacity-100 transition-opacity bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg shrink-0 shadow-sm"
                      >
                        Invite
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

          {/* CENTER COLUMN: Map Room Actions & Recent Rooms Grid (6 Columns) */}
          <div className="lg:col-span-6 flex flex-col gap-6 w-full lg:mt-8 lg:order-2 order-1">

            {/* Control Panel (Start New / Join Existing) */}
            <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 md:p-8 flex flex-col relative overflow-hidden">

              {/* iOS Style Segmented Control */}
              <div className="relative w-full h-[50px] bg-slate-100 rounded-xl p-1 flex items-center mb-6 border border-slate-200 z-10">
                <div
                  className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-lg shadow-sm border border-slate-200 transition-all duration-300 ease-out"
                  style={{ transform: activeTab === 'create' ? 'translateX(0)' : 'translateX(100%)' }}
                />

                <button
                  onClick={() => setActiveTab('create')}
                  className={`flex-1 h-full rounded-lg font-bold text-[14px] z-10 transition-colors duration-200 ${activeTab === 'create' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Start New
                </button>
                <button
                  onClick={() => setActiveTab('join')}
                  className={`flex-1 h-full rounded-lg font-bold text-[14px] z-10 transition-colors duration-200 ${activeTab === 'join' ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Join Existing
                </button>
              </div>

              {/* Dynamic Content Area */}
              <div className="relative z-10 min-h-[160px] flex flex-col justify-between">

                {/* CREATE TAB */}
                {activeTab === 'create' && (
                  <div className="animate-in fade-in zoom-in-95 duration-200 flex flex-col justify-between h-full flex-grow">
                    <div>
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 bg-slate-100 text-slate-700 border border-slate-200 rounded-xl flex items-center justify-center shrink-0">
                          <Navigation size={22} className="rotate-45" strokeWidth={2} />
                        </div>
                        <div>
                          <h3 className="text-[18px] font-extrabold tracking-[-0.02em] text-slate-900">Create Map Room</h3>
                          <p className="text-[13px] font-medium text-slate-500">Generate a secure session token.</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-4 mt-2">
                      <input
                        type="text"
                        placeholder="Group Name (e.g. Weekend Trip)"
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        className="w-full h-[52px] px-4 text-[15px] font-medium bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100 transition-all text-slate-900 placeholder-slate-400"
                      />
                      <button
                        onClick={handleCreateRoom}
                        disabled={isCreating}
                        className="w-full h-[52px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-[15px] transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] shadow-sm"
                      >
                        {isCreating ? 'Creating...' : 'Launch Session'}
                        {!isCreating && <ArrowRight size={16} />}
                      </button>
                    </div>
                  </div>
                )}

                {/* JOIN TAB */}
                {activeTab === 'join' && (
                  <div className="animate-in fade-in zoom-in-95 duration-200 flex flex-col justify-between h-full flex-grow">
                    <div>
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 bg-slate-100 text-slate-700 border border-slate-200 rounded-xl flex items-center justify-center shrink-0">
                          <Map size={22} strokeWidth={2} />
                        </div>
                        <div>
                          <h3 className="text-[18px] font-extrabold tracking-[-0.02em] text-slate-900">Join Map Room</h3>
                          <p className="text-[13px] font-medium text-slate-500">Enter the 6-digit access code.</p>
                        </div>
                      </div>
                    </div>

                    <form onSubmit={handleJoinRoom} className="flex flex-col gap-4 mt-2 relative">
                      <input
                        type="text"
                        placeholder="CODE"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                        maxLength={6}
                        className="w-full h-[52px] px-4 text-[20px] tracking-[0.3em] font-bold uppercase bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100 transition-all text-slate-900 placeholder-slate-300 text-center"
                        required
                      />
                      <button
                        type="submit"
                        disabled={joinCode.length !== 6}
                        className="w-full h-[52px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-[15px] flex items-center justify-center transition-all disabled:opacity-30 active:scale-[0.98] shadow-sm"
                      >
                        Enter Map
                      </button>

                      {joinError && (
                        <div className="absolute top-full left-0 right-0 mt-2 text-center text-rose-600 text-[13px] font-semibold">
                          {joinError}
                        </div>
                      )}
                    </form>
                  </div>
                )}

              </div>
            </div>

            {/* Travel & Transit Preferences Card (Moved from right column) */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm transition-all duration-300 hover:shadow-[0_8px_30px_rgba(0,0,0,0.02)]">
              <h3 className="text-[14px] font-bold text-slate-900 mb-1.5 flex items-center gap-2">
                <Sparkles size={15} className="text-indigo-500 animate-pulse" />
                Travel Preferences
              </h3>
              <p className="text-[11px] text-slate-500 font-medium mb-3.5 leading-relaxed">
                Choose your default transit type and destination category for meeting.
              </p>

              {/* Transit Mode Selection (Custom Segmented Control) */}
              <div className="flex flex-col gap-2 mb-4">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none">Transit Mode</span>
                <div className="grid grid-cols-3 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs gap-1">
                  <button
                    onClick={() => handleTransitModeChange('driving')}
                    className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2 px-1 rounded-lg font-bold transition-all ${transitMode === 'driving' ? 'bg-white text-slate-900 shadow-sm border border-slate-200/25' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    <Car size={13} className={transitMode === 'driving' ? 'text-indigo-600' : 'text-slate-400'} />
                    <span className="text-[10px] sm:text-xs">Drive</span>
                  </button>
                  <button
                    onClick={() => handleTransitModeChange('cycling')}
                    className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2 px-1 rounded-lg font-bold transition-all ${transitMode === 'cycling' ? 'bg-white text-slate-900 shadow-sm border border-slate-200/25' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    <Bike size={13} className={transitMode === 'cycling' ? 'text-indigo-600' : 'text-slate-400'} />
                    <span className="text-[10px] sm:text-xs">Cycle</span>
                  </button>
                  <button
                    onClick={() => handleTransitModeChange('walking')}
                    className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2 px-1 rounded-lg font-bold transition-all ${transitMode === 'walking' ? 'bg-white text-slate-900 shadow-sm border border-slate-200/25' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    <Footprints size={13} className={transitMode === 'walking' ? 'text-indigo-600' : 'text-slate-400'} />
                    <span className="text-[10px] sm:text-xs">Walk</span>
                  </button>
                </div>
              </div>

              {/* Preferred Venue Category (Custom Icons & Buttons) */}
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none">Default Category</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleCategoryChange('cafes')}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all ${preferredCategory === 'cafes' ? 'bg-indigo-50/50 border-indigo-200 text-indigo-900' : 'bg-slate-50/40 border-slate-200/70 hover:bg-slate-50 text-slate-600'}`}
                  >
                    <Coffee size={14} className={preferredCategory === 'cafes' ? 'text-indigo-600' : 'text-slate-400'} />
                    <span className="text-[11px] font-bold">Cafes</span>
                  </button>
                  <button
                    onClick={() => handleCategoryChange('restaurants')}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all ${preferredCategory === 'restaurants' ? 'bg-indigo-50/50 border-indigo-200 text-indigo-900' : 'bg-slate-50/40 border-slate-200/70 hover:bg-slate-50 text-slate-600'}`}
                  >
                    <Utensils size={14} className={preferredCategory === 'restaurants' ? 'text-indigo-600' : 'text-slate-400'} />
                    <span className="text-[11px] font-bold">Dine Out</span>
                  </button>
                  <button
                    onClick={() => handleCategoryChange('parks')}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all ${preferredCategory === 'parks' ? 'bg-indigo-50/50 border-indigo-200 text-indigo-900' : 'bg-slate-50/40 border-slate-200/70 hover:bg-slate-50 text-slate-600'}`}
                  >
                    <Trees size={14} className={preferredCategory === 'parks' ? 'text-indigo-600' : 'text-slate-400'} />
                    <span className="text-[11px] font-bold">Parks</span>
                  </button>
                  <button
                    onClick={() => handleCategoryChange('workspaces')}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all ${preferredCategory === 'workspaces' ? 'bg-indigo-50/50 border-indigo-200 text-indigo-900' : 'bg-slate-50/40 border-slate-200/70 hover:bg-slate-50 text-slate-600'}`}
                  >
                    <Briefcase size={14} className={preferredCategory === 'workspaces' ? 'text-indigo-600' : 'text-slate-400'} />
                    <span className="text-[11px] font-bold">Office</span>
                  </button>
                </div>
              </div>

              {/* Privacy Settings */}
              <div className="flex flex-col gap-2 mt-4">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none">Privacy</span>
                <button
                  onClick={handleGhostModeToggle}
                  className={`flex items-center justify-between p-3 rounded-xl border transition-all ${ghostMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600'}`}
                >
                  <div className="flex items-center gap-2.5">
                    <EyeOff size={16} className={ghostMode ? 'text-indigo-400' : 'text-slate-400'} />
                    <div className="flex flex-col text-left">
                      <span className={`text-[12px] font-bold ${ghostMode ? 'text-white' : 'text-slate-800'}`}>Ghost Mode</span>
                      <span className={`text-[10px] font-medium leading-tight mt-0.5 ${ghostMode ? 'text-slate-300' : 'text-slate-500'}`}>Fuzz exact location by 500m</span>
                    </div>
                  </div>
                  <div className={`w-10 h-5 rounded-full flex items-center p-1 transition-colors ${ghostMode ? 'bg-indigo-500' : 'bg-slate-300'}`}>
                    <div className={`w-3.5 h-3.5 bg-white rounded-full transition-transform ${ghostMode ? 'translate-x-4.5' : 'translate-x-0'}`} />
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Recent Travels (3 Columns, moved from center column) */}
          <div className="lg:col-span-3 flex flex-col gap-6 w-full lg:mt-8 lg:order-3 order-3">
            {recentRooms.length > 0 && (
              <div className="w-full bg-white border border-slate-200/80 shadow-sm rounded-2xl p-5 flex flex-col gap-4">

                {/* Search & Filter Header */}
                <div className="flex items-center gap-2">
                  <Clock size={15} className="text-indigo-500" />
                  <h3 className="text-[14px] font-bold text-slate-900 tracking-tight">Recent Travel Logs</h3>
                </div>

                {/* Search & Filter stacked in narrow column */}
                <div className="flex flex-col gap-2.5">
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search logs..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg py-2 pl-8 pr-3 outline-none focus:bg-white focus:border-indigo-500 transition-all placeholder-slate-400 text-slate-800"
                    />
                  </div>

                  <div className="grid grid-cols-3 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px] font-bold text-center">
                    <button
                      onClick={() => setFilterTab('all')}
                      className={`py-1 rounded-md transition-all ${filterTab === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setFilterTab('hosted')}
                      className={`py-1 rounded-md transition-all ${filterTab === 'hosted' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      Hosted
                    </button>
                    <button
                      onClick={() => setFilterTab('joined')}
                      className={`py-1 rounded-md transition-all ${filterTab === 'joined' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                      Joined
                    </button>
                  </div>
                </div>

                {/* Grid list of Travel Logs */}
                {filteredRooms.length === 0 ? (
                  <div className="text-center py-6 flex flex-col items-center justify-center">
                    <p className="text-slate-400 font-semibold text-[12px]">No logs found</p>
                    <button onClick={() => { setSearchQuery(''); setFilterTab('all'); }} className="mt-1 text-[11px] font-bold text-indigo-600 hover:underline">
                      Clear filters
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {filteredRooms.map((room) => {
                      const isRecent = room.joinedAt?.toMillis() > Date.now() - 24 * 60 * 60 * 1000;
                      const isHostedByMe = room.hostId === user?.uid;
                      const dateJoined = room.joinedAt ? new Date(room.joinedAt.toMillis()).toLocaleDateString() : 'Unknown';

                      return (
                        <div
                          key={room.id}
                          onClick={() => handleRejoin(room.id)}
                          className="group relative bg-white border border-indigo-100/50 rounded-xl cursor-pointer p-3.5 hover:shadow-md hover:border-indigo-200 transition-all duration-200 flex flex-col gap-2.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                                <MapPin size={16} strokeWidth={2.5} />
                              </div>
                              <div className="min-w-0">
                                <h4 className="text-[14px] font-bold text-slate-800 truncate leading-tight group-hover:text-indigo-600 transition-colors">
                                  {room.name || 'Unnamed Trip'}
                                </h4>
                                <p className="text-[11px] font-semibold text-slate-400 mt-0.5">Code: {room.id}</p>
                              </div>
                            </div>
                            <button
                              onClick={(e) => handleDeleteRecent(e, room.id)}
                              className="text-slate-300 hover:text-rose-500 p-1.5 transition-colors rounded-lg hover:bg-rose-50 shrink-0"
                              title="Delete Log"
                            >
                              <Trash2 size={15} strokeWidth={1.5} />
                            </button>
                          </div>

                          <div className="flex items-center justify-between border-t border-slate-50 pt-2 text-[11px] text-slate-400 font-medium">
                            <span>{dateJoined}</span>
                            <div className="flex items-center gap-2">
                              {isRecent ? (
                                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider">
                                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                  Active
                                </span>
                              ) : (
                                <span className="text-[9px] font-bold uppercase tracking-wider bg-slate-50 text-slate-500 px-1.5 py-0.5 rounded border border-slate-100">
                                  {isHostedByMe ? 'Hosted' : 'Joined'}
                                </span>
                              )}
                              <span className="text-indigo-600 font-bold flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                                Resume <ChevronRight size={12} strokeWidth={2.5} />
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
