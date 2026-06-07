import React, { useState, useEffect, useRef } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { Send, X, MessageCircle } from 'lucide-react';

interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  createdAt: any;
  isSystem?: boolean;
}

interface ChatPanelProps {
  roomId: string;
  isPermanent?: boolean;
  onClose?: () => void;
}

export default function ChatPanel({ roomId, isPermanent = false, onClose }: ChatPanelProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isOpen, setIsOpen] = useState(isPermanent);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!roomId) return;

    const q = query(
      collection(db, `rooms/${roomId}/messages`),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((doc) => {
        msgs.push({ id: doc.id, ...doc.data() } as Message);
      });
      setMessages(msgs);
      setTimeout(() => scrollToBottom(), 100);
    });

    return () => unsubscribe();
  }, [roomId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;

    try {
      await addDoc(collection(db, `rooms/${roomId}/messages`), {
        text: newMessage,
        senderId: user.uid,
        senderName: user.displayName || 'Guest',
        createdAt: serverTimestamp(),
      });
      setNewMessage('');
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  if (!isOpen && !isPermanent) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-[#0284C7] hover:bg-[#0369A1] text-white rounded-full shadow-[0_8px_30px_rgb(2,132,199,0.3)] flex items-center justify-center transition-transform hover:scale-110 z-50 lg:hidden"
      >
        <MessageCircle size={24} />
      </button>
    );
  }

  // Dashboard sidebar styling for permanent mode
  const containerClasses = isPermanent 
    ? "w-full h-full bg-white border border-slate-200 shadow-sm rounded-3xl flex flex-col overflow-hidden hidden lg:flex"
    : "fixed bottom-6 right-6 w-[340px] h-[480px] bg-white rounded-3xl shadow-[0_12px_40px_rgb(0,0,0,0.12)] border border-slate-200 flex flex-col overflow-hidden z-50 lg:hidden";

  return (
    <div className={containerClasses}>
      
      {/* Header */}
      <div className="p-4 px-5 flex items-center justify-between border-b border-slate-100 bg-white z-10 shadow-sm">
        <h3 className="font-semibold text-[#1E293B] flex items-center gap-2.5 text-[15px]">
          <div className="w-8 h-8 rounded-full bg-sky-50 text-[#0284C7] flex items-center justify-center">
            <MessageCircle size={16} />
          </div>
          Group Chat
        </h3>
        <div className="flex items-center">
          {!isPermanent ? (
            <button onClick={() => setIsOpen(false)} className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-[#64748B] hover:text-[#1E293B] hover:bg-slate-100 transition-colors">
              <X size={16} />
            </button>
          ) : onClose ? (
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-[#64748B] hover:text-[#0284C7] hover:bg-sky-50 transition-colors" title="Minimize Chat">
              <X size={16} />
            </button>
          ) : null}
        </div>
      </div>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-4 px-5 space-y-4 bg-[#F8FAFC] custom-scrollbar">
        {messages.map((msg) => {
          if (msg.isSystem) {
            return (
              <div key={msg.id} className="flex justify-center my-3 animate-in fade-in zoom-in duration-300">
                <div className="bg-slate-100 text-[#475569] text-[12px] font-medium px-4 py-1.5 rounded-full border border-slate-200 text-center shadow-sm">
                  {msg.text}
                </div>
              </div>
            );
          }

          const isMe = msg.senderId === user?.uid;
          return (
            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2`}>
              <span className="text-[11px] font-medium text-[#94A3B8] mb-1.5 ml-1">{isMe ? 'You' : msg.senderName}</span>
              <div className={`px-4 py-2.5 max-w-[85%] ${isMe ? 'bg-gradient-to-br from-[#0284C7] to-[#0369A1] text-white rounded-[20px] rounded-br-sm shadow-sm' : 'bg-white border border-slate-200 text-[#1E293B] rounded-[20px] rounded-bl-sm shadow-sm'}`}>
                <p className="text-[14px] leading-relaxed">{msg.text}</p>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 bg-white border-t border-slate-100 z-10">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2 bg-[#F8FAFC] border border-slate-200 p-1 pl-4 rounded-full focus-within:bg-white focus-within:border-[#0284C7] focus-within:ring-2 focus-within:ring-[#0284C7]/10 transition-all">
          <input 
            type="text" 
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-transparent text-[14px] outline-none text-[#1E293B] placeholder-[#94A3B8]"
          />
          <button 
            type="submit" 
            disabled={!newMessage.trim()}
            className="w-9 h-9 bg-[#0284C7] text-white rounded-full flex items-center justify-center disabled:opacity-40 transition-colors shrink-0 hover:bg-[#0369A1]"
          >
            <Send size={15} className="ml-0.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
