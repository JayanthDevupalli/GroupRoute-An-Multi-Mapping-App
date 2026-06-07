"use client";

import React from 'react';

export interface UserEta {
  id: string;
  name: string;
  speed: string;
  eta: string;
  status: 'en-route' | 'arrived' | 'offline';
}

interface EtaBoardProps {
  users: UserEta[];
}

export default function EtaBoard({ users }: EtaBoardProps) {
  if (users.length === 0) return null;

  return (
    <div className="absolute top-20 left-6 z-40 bg-[--color-panel-bg] p-4 rounded-xl shadow-lg w-72 border border-gray-100">
      <h3 className="text-lg font-semibold border-b pb-2 mb-3 text-[--color-foreground]">ETA Board</h3>
      <div className="space-y-3">
        {users.map(user => (
          <div key={user.id} className="flex flex-col bg-[--color-app-bg] p-3 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium truncate text-[--color-foreground]">{user.name}</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                user.status === 'arrived' ? 'bg-green-100 text-green-700' :
                user.status === 'offline' ? 'bg-gray-200 text-gray-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                {user.status === 'arrived' ? 'Arrived' :
                 user.status === 'offline' ? 'Offline' : 'En Route'}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {user.speed}
              </span>
              <span className="font-medium">{user.eta}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
