'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { MapPin, Settings, Bell, Check, X, LogOut } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

interface Notification {
  id: string;
  type: string;
  roomId: string;
  friendUid: string;
  friendName: string;
  timestamp: any;
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Listen for real-time notifications
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, `users/${user.uid}/notifications`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs: Notification[] = [];
      snapshot.forEach((doc) => {
        notifs.push({ id: doc.id, ...doc.data() } as Notification);
      });
      // Sort by newest first
      notifs.sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));
      setNotifications(notifs);
    });
    return () => unsubscribe();
  }, [user]);

  const handleAccept = async (notif: Notification) => {
    try {
      if (notif.type === 'friend_request') {
        await setDoc(doc(db, `users/${user?.uid}/friends`, notif.friendUid), {
          displayName: notif.friendName,
          addedAt: serverTimestamp()
        });
        await setDoc(doc(db, `users/${notif.friendUid}/friends`, user?.uid as string), {
          displayName: user?.displayName || 'User',
          addedAt: serverTimestamp()
        });
        await deleteDoc(doc(db, `users/${user?.uid}/notifications`, notif.id));
      } else {
        // 1. Add them to participants
        await setDoc(doc(db, `rooms/${notif.roomId}/participants`, notif.friendUid), {
          name: notif.friendName,
          joinedAt: serverTimestamp(),
          // Location will be updated by the client once they get access
          lat: 0,
          lng: 0 
        });
        // 2. Remove notification
        await deleteDoc(doc(db, `users/${user?.uid}/notifications`, notif.id));
      }
    } catch (err) {
      console.error("Failed to accept request", err);
    }
  };

  const handleReject = async (notif: Notification) => {
    try {
      await deleteDoc(doc(db, `users/${user?.uid}/notifications`, notif.id));
    } catch (err) {
      console.error("Failed to reject request", err);
    }
  };

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 w-[calc(100%-3rem)] max-w-5xl z-50">
      <nav className="h-16 bg-white/70 backdrop-blur-2xl border border-white/50 shadow-[0_2px_10px_rgba(0,0,0,0.02)] rounded-full flex items-center justify-between px-4 transition-all">
        
        <div className="flex items-center gap-2.5 pl-2 cursor-pointer" onClick={() => router.push('/lobby')}>
          <div className="w-8 h-8 rounded-full bg-gradient-to-b from-[#0284C7] to-[#0369A1] flex items-center justify-center shadow-sm">
            <MapPin size={16} className="text-white" />
          </div>
          <span className="font-semibold text-[17px] tracking-[-0.02em] text-[#1E293B] hidden sm:block">GroupRoute</span>
        </div>

        <div className="flex items-center gap-3">
          
          {/* Action Icons */}
          <div className="flex items-center gap-1">
            <button className="w-8 h-8 rounded-full flex items-center justify-center text-[#64748B] hover:text-[#1E293B] hover:bg-black/5 transition-colors">
              <Settings size={18} strokeWidth={2} />
            </button>
            
            <div className="relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors relative ${showNotifications ? 'bg-black/5 text-[#1E293B]' : 'text-[#64748B] hover:text-[#1E293B] hover:bg-black/5'}`}
              >
                <Bell size={18} strokeWidth={2} />
                {notifications.length > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#0284C7] rounded-full border border-white/80 shadow-sm" />
                )}
              </button>

              {/* Notifications Dropdown */}
              {showNotifications && (
                <div className="absolute top-full mt-4 right-0 w-80 bg-white/85 backdrop-blur-3xl border border-slate-200/60 shadow-[0_12px_40px_rgb(0,0,0,0.12)] rounded-[28px] p-2 flex flex-col z-50">
                  <div className="px-4 py-3 flex items-center justify-between border-b border-black/5">
                    <h4 className="text-[15px] font-semibold tracking-[-0.01em] text-[#1E293B]">Pending Approvals</h4>
                    {notifications.length > 0 && (
                      <span className="bg-sky-50 text-[#0284C7] text-[11px] font-bold px-2 py-0.5 rounded-full">{notifications.length} New</span>
                    )}
                  </div>
                  
                  <div className="p-2 flex flex-col gap-2 max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="text-center text-[13px] font-medium text-[#64748B] py-4">No pending requests</p>
                    ) : (
                      notifications.map(notif => (
                        <div key={notif.id} className="bg-white rounded-[20px] p-3 shadow-[0_2px_10px_rgb(0,0,0,0.03)] border border-slate-100 flex items-center gap-3 transition-all hover:shadow-[0_4px_15px_rgb(0,0,0,0.06)]">
                          <div className="w-10 h-10 rounded-full bg-slate-100 text-[#1E293B] flex items-center justify-center font-bold text-[14px] shrink-0">
                            {notif.friendName.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-semibold text-[#1E293B] leading-tight truncate">{notif.friendName}</p>
                            <p className="text-[12px] text-[#64748B] truncate">
                              {notif.type === 'friend_request' ? 'Sent a friend request' : `Requested ${notif.roomId}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleReject(notif)} className="w-8 h-8 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-colors">
                              <X size={16} strokeWidth={2.5} />
                            </button>
                            <button onClick={() => handleAccept(notif)} className="w-8 h-8 rounded-full bg-[#0284C7] text-white flex items-center justify-center hover:bg-[#0369A1] shadow-sm transition-colors">
                              <Check size={16} strokeWidth={2.5} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="w-px h-6 bg-slate-200 hidden sm:block"></div>

          {/* User Profile */}
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-[13px] font-medium text-[#1E293B] leading-tight">{user?.displayName || 'User'}</span>
          </div>
          <div className="w-8 h-8 rounded-full bg-[#F8FAFC] flex items-center justify-center border border-slate-200 text-[#1E293B] font-semibold text-xs">
            {user?.displayName?.charAt(0) || 'U'}
          </div>
          <button onClick={() => { logout(); router.push('/login'); }} className="w-8 h-8 rounded-full flex items-center justify-center text-[#64748B] hover:text-[#1E293B] hover:bg-slate-100 transition-colors">
            <LogOut size={14} strokeWidth={2} />
          </button>

        </div>
      </nav>
    </div>
  );
}
