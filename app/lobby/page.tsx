'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useRoom } from '@/context/RoomContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Plus, ArrowRight, Clock, MapPin, Navigation, Map } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp, collection, query, orderBy, onSnapshot } from 'firebase/firestore';

interface RecentRoom {
  id: string;
  joinedAt: any;
  lastActive?: any;
  name?: string;
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
  const [activeTab, setActiveTab] = useState<'create' | 'join'>('create');

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
              name: roomSnap.data().name || 'Unnamed Group'
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

  const handleRejoin = (code: string) => {
    setRoomId(code);
    router.push(`/session`);
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-50 flex flex-col items-center relative font-sans pt-28 pb-20">

        {/* Subtle Static Background */}
        <div className="fixed top-0 left-0 w-full h-full pointer-events-none z-0">
          <div className="absolute inset-0 opacity-[0.02]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z' fill='%23000000' fill-opacity='1'/%3E%3C/g%3E%3C/svg%3E")`, backgroundSize: '60px 60px' }} />
        </div>

        <div className="w-full max-w-7xl px-6 z-10 flex flex-col xl:flex-row gap-12 xl:gap-20 items-center xl:items-start justify-center">

          {/* LEFT COLUMN (Header + Form Card) */}
          <div className="flex flex-col items-center xl:items-start w-full xl:w-[500px] shrink-0 xl:mt-8">

            {/* Minimalist Logo Header */}
            <div className="mb-10 flex flex-col items-center xl:items-start justify-center">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-gradient-to-tr from-sky-500 to-indigo-500 rounded-xl flex items-center justify-center text-white shadow-[0_4px_15px_rgba(99,102,241,0.3)]">
                  <MapPin size={20} strokeWidth={2.5} />
                </div>
                <h1 className="text-[24px] font-extrabold tracking-[-0.02em] text-[#1E293B]">
                  GroupRouter
                </h1>
              </div>
              <p className="text-[14px] font-medium text-[#64748B]">Meet in the middle.</p>
            </div>

            {/* Clean Professional Card */}
            <div className="w-full max-w-xl z-20 relative mt-2">

              <div className="bg-white border border-slate-200 shadow-xl shadow-slate-200/50 rounded-[32px] p-8 md:p-10 flex flex-col relative overflow-hidden">

                {/* iOS Style Segmented Control */}
                <div className="relative w-full h-[56px] bg-slate-100/80 backdrop-blur-md rounded-2xl p-1.5 flex items-center mb-8 shadow-inner z-10">
                  <div
                    className={`absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-transform duration-300 ease-out`}
                    style={{ transform: activeTab === 'create' ? 'translateX(0)' : 'translateX(100%)' }}
                  />

                  <button
                    onClick={() => setActiveTab('create')}
                    className={`flex-1 h-full rounded-xl font-bold text-[15px] z-10 transition-colors duration-300 ${activeTab === 'create' ? 'text-[#1E293B]' : 'text-[#64748B] hover:text-[#1E293B]'}`}
                  >
                    Start New
                  </button>
                  <button
                    onClick={() => setActiveTab('join')}
                    className={`flex-1 h-full rounded-xl font-bold text-[15px] z-10 transition-colors duration-300 ${activeTab === 'join' ? 'text-[#1E293B]' : 'text-[#64748B] hover:text-[#1E293B]'}`}
                  >
                    Join Existing
                  </button>
                </div>

                {/* Dynamic Content Area */}
                <div className="relative z-10 min-h-[220px]">

                  {/* CREATE TAB */}
                  {activeTab === 'create' && (
                    <div className="animate-in fade-in zoom-in-95 duration-300 flex flex-col h-full">
                      <div className="flex items-center gap-4 mb-6">
                        <div className="w-12 h-12 bg-gradient-to-br from-sky-100 to-sky-50 text-[#0284C7] border border-sky-100 rounded-2xl flex items-center justify-center shadow-sm shrink-0">
                          <Navigation size={24} className="rotate-45" strokeWidth={2} />
                        </div>
                        <div>
                          <h3 className="text-[22px] font-extrabold tracking-[-0.02em] text-[#1E293B]">Create Map Room</h3>
                          <p className="text-[14px] font-medium text-[#64748B]">Generate a secure session token.</p>
                        </div>
                      </div>

                      <div className="mt-auto flex flex-col gap-4">
                        <input
                          type="text"
                          placeholder="Group Name (e.g. Weekend Trip)"
                          value={groupName}
                          onChange={(e) => setGroupName(e.target.value)}
                          className="w-full h-[60px] px-6 text-[16px] font-semibold bg-white border-2 border-slate-100 rounded-2xl outline-none focus:bg-white focus:border-[#0284C7] focus:ring-4 focus:ring-[#0284C7]/10 transition-all text-[#1E293B] placeholder-[#94A3B8] shadow-sm"
                        />
                        <button
                          onClick={handleCreateRoom}
                          disabled={isCreating}
                          className="w-full h-[60px] bg-gradient-to-r from-[#0284C7] to-[#0369A1] hover:from-[#0369A1] hover:to-[#075985] text-white rounded-2xl font-bold text-[16px] tracking-wide transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-[0_8px_20px_rgba(2,132,199,0.25)] hover:shadow-[0_8px_25px_rgba(2,132,199,0.35)]"
                        >
                          {isCreating ? 'Creating...' : 'Launch Session'}
                          {!isCreating && <ArrowRight size={18} />}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* JOIN TAB */}
                  {activeTab === 'join' && (
                    <div className="animate-in fade-in zoom-in-95 duration-300 flex flex-col h-full">
                      <div className="flex items-center gap-4 mb-6">
                        <div className="w-12 h-12 bg-gradient-to-br from-indigo-100 to-indigo-50 text-indigo-600 border border-indigo-100 rounded-2xl flex items-center justify-center shadow-sm shrink-0">
                          <Map size={24} strokeWidth={2} />
                        </div>
                        <div>
                          <h3 className="text-[22px] font-extrabold tracking-[-0.02em] text-[#1E293B]">Join Map Room</h3>
                          <p className="text-[14px] font-medium text-[#64748B]">Enter the 6-digit access code.</p>
                        </div>
                      </div>

                      <form onSubmit={handleJoinRoom} className="mt-auto flex flex-col gap-4 relative">
                        <input
                          type="text"
                          placeholder="CODE"
                          value={joinCode}
                          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                          maxLength={6}
                          className="w-full h-[60px] px-6 text-[22px] tracking-[0.3em] font-black uppercase bg-white border-2 border-slate-100 rounded-2xl outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 transition-all text-[#1E293B] placeholder-[#CBD5E1] shadow-sm text-center"
                          required
                        />
                        <button
                          type="submit"
                          disabled={joinCode.length !== 6}
                          className="w-full h-[60px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold text-[16px] flex items-center justify-center transition-all disabled:opacity-30 disabled:hover:bg-indigo-600 shadow-[0_8px_20px_rgba(79,70,229,0.25)] hover:shadow-[0_8px_25px_rgba(79,70,229,0.35)]"
                        >
                          Enter Map
                        </button>

                        {joinError && (
                          <div className="absolute top-full left-0 right-0 mt-3 text-center text-rose-500 text-[13px] font-bold">
                            {joinError}
                          </div>
                        )}
                      </form>
                    </div>
                  )}

                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN (Recent Sessions List) */}
          <div className="flex-1 w-full max-w-3xl xl:mt-8">
            {recentRooms.length > 0 && (
              <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-200/50 flex items-center justify-center text-[#475569]">
                      <Clock size={16} />
                    </div>
                    <h3 className="text-[18px] font-bold text-[#1E293B] tracking-tight">Recent Travel Logs</h3>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {recentRooms.map((room) => {
                    const isRecent = room.joinedAt?.toMillis() > Date.now() - 24 * 60 * 60 * 1000; // Less than 24h
                    return (
                      <div
                        key={room.id}
                        onClick={() => handleRejoin(room.id)}
                        className="group bg-white border border-slate-200 rounded-3xl p-1 cursor-pointer shadow-sm hover:shadow-[0_10px_30px_rgba(0,0,0,0.06)] hover:-translate-y-1 transition-all overflow-hidden relative"
                      >
                        {/* Ticket Header */}
                        <div className="bg-[#F8FAFC] rounded-[20px] p-4 flex items-start justify-between border-b border-slate-200/50 border-dashed relative">
                          {/* Cutouts for ticket effect */}
                          <div className="absolute -bottom-2 -left-2 w-4 h-4 bg-white rounded-full border-t border-r border-slate-200"></div>
                          <div className="absolute -bottom-2 -right-2 w-4 h-4 bg-white rounded-full border-t border-l border-slate-200"></div>

                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-[0.2em] mb-1">Token: {room.id}</span>
                            <h4 className="text-[18px] font-black text-[#1E293B] tracking-tight truncate max-w-[180px]">{room.name || room.id}</h4>
                          </div>
                          {isRecent && (
                            <div className="flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                              </span>
                              <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Live</span>
                            </div>
                          )}
                        </div>

                        {/* Ticket Body */}
                        <div className="p-4 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                              <MapPin size={18} />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[13px] font-semibold text-[#1E293B] group-hover:text-indigo-600 transition-colors">Resume Route</span>
                              <span className="text-[11px] font-medium text-[#64748B] mt-0.5">Click to enter map</span>
                            </div>
                          </div>
                          <ArrowRight size={16} className="text-[#94A3B8] group-hover:translate-x-1 transition-transform group-hover:text-indigo-600" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </ProtectedRoute>
  );
}
