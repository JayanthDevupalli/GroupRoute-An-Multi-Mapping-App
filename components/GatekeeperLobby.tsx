"use client";

import React from 'react';

export interface PendingUser {
  id: string;
  name: string;
}

interface GatekeeperLobbyProps {
  isLeader: boolean;
  pendingUsers: PendingUser[];
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  status: 'pending' | 'approved' | 'rejected';
}

export default function GatekeeperLobby({ isLeader, pendingUsers, onAccept, onReject, status }: GatekeeperLobbyProps) {
  if (!isLeader) {
    if (status === 'approved') return null; // hide lobby if approved
    
    return (
      <div className="absolute inset-0 bg-[--color-app-bg] z-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-[--color-panel-bg] p-8 rounded-2xl shadow-xl max-w-md w-full border">
          <h2 className="text-2xl font-semibold mb-4 text-[--color-foreground]">Joining GroupRoute</h2>
          {status === 'pending' ? (
            <div>
              <div className="animate-spin w-12 h-12 border-4 border-[--color-master-blue] border-t-transparent rounded-full mx-auto mb-4" />
              <p className="text-gray-600">Waiting for the Group Leader to approve your request...</p>
            </div>
          ) : (
            <p className="text-red-500 font-medium">Your request to join was declined.</p>
          )}
        </div>
      </div>
    );
  }

  // Leader view of pending requests
  if (pendingUsers.length === 0) return null;

  return (
    <div className="absolute top-20 right-6 z-40 bg-[--color-panel-bg] p-4 rounded-xl shadow-lg w-80 max-h-96 overflow-y-auto border border-gray-100">
      <h3 className="text-lg font-semibold border-b pb-2 mb-3 text-[--color-foreground]">Pending Requests</h3>
      <div className="space-y-3">
        {pendingUsers.map(user => (
          <div key={user.id} className="flex items-center justify-between bg-[--color-app-bg] p-2 rounded-lg border border-gray-200">
            <span className="font-medium truncate mr-2 text-[--color-foreground]">{user.name}</span>
            <div className="flex gap-2 shrink-0">
              <button 
                onClick={() => onReject(user.id)}
                className="px-3 py-1 text-sm text-red-600 border border-red-200 hover:bg-red-50 rounded-md transition"
              >
                Reject
              </button>
              <button 
                onClick={() => onAccept(user.id)}
                className="px-3 py-1 text-sm bg-[--color-master-blue] hover:bg-blue-700 text-white rounded-md transition shadow-sm"
              >
                Accept
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
