"use client";

import React, { useState } from 'react';

export interface PollOption {
  id: string;
  name: string;
  votes: number;
}

interface AdminControlsProps {
  isLeader: boolean;
  pollActive: boolean;
  options: PollOption[];
  onStartPoll: () => void;
  onEndPoll: () => void;
  onVote: (id: string) => void;
}

export default function AdminControls({ isLeader, pollActive, options, onStartPoll, onEndPoll, onVote }: AdminControlsProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  if (!isLeader && !pollActive) return null;

  return (
    <div className="absolute bottom-6 right-6 z-40 bg-[--color-panel-bg] p-4 rounded-xl shadow-lg w-80 border border-gray-100">
      <h3 className="text-lg font-semibold border-b pb-2 mb-3 text-[--color-foreground]">
        {pollActive ? 'Live Destination Poll' : 'Admin Controls'}
      </h3>
      
      {!pollActive && isLeader && (
        <button 
          onClick={onStartPoll}
          className="w-full py-2 bg-[--color-master-blue] hover:bg-blue-700 text-white font-medium rounded-lg transition shadow-sm"
        >
          Suggest Nearby Spots
        </button>
      )}

      {pollActive && (
        <div className="space-y-3">
          {options.map(option => (
            <button
              key={option.id}
              onClick={() => {
                setSelectedOption(option.id);
                onVote(option.id);
              }}
              className={`w-full flex items-center justify-between p-3 rounded-lg border text-left transition ${
                selectedOption === option.id 
                  ? 'border-[--color-master-blue] bg-blue-50 ring-1 ring-[--color-master-blue]' 
                  : 'border-gray-200 hover:border-blue-300'
              }`}
            >
              <span className="font-medium text-[--color-foreground]">{option.name}</span>
              <span className="text-sm bg-gray-100 px-2 py-0.5 rounded-full">{option.votes} votes</span>
            </button>
          ))}

          {isLeader && (
            <button 
              onClick={onEndPoll}
              className="w-full mt-2 py-2 border border-red-200 text-red-600 hover:bg-red-50 font-medium rounded-lg transition"
            >
              End Poll & Set Destination
            </button>
          )}
        </div>
      )}
    </div>
  );
}
