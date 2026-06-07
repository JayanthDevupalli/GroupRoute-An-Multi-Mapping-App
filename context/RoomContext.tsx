'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface RoomContextType {
  roomId: string | null;
  setRoomId: (id: string | null) => void;
}

const RoomContext = createContext<RoomContextType>({
  roomId: null,
  setRoomId: () => {},
});

export const useRoom = () => useContext(RoomContext);

export const RoomProvider = ({ children }: { children: React.ReactNode }) => {
  const [roomId, setRoomIdState] = useState<string | null>(null);

  useEffect(() => {
    // Rehydrate roomId from sessionStorage on mount
    const storedId = sessionStorage.getItem('currentRoomId');
    if (storedId) {
      setRoomIdState(storedId);
    }
  }, []);

  const setRoomId = (id: string | null) => {
    setRoomIdState(id);
    if (id) {
      sessionStorage.setItem('currentRoomId', id);
    } else {
      sessionStorage.removeItem('currentRoomId');
    }
  };

  return (
    <RoomContext.Provider value={{ roomId, setRoomId }}>
      {children}
    </RoomContext.Provider>
  );
};
