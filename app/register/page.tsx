'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Mail, Lock, User, MapPin } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('visible'); }),
      { threshold: 0.1 }
    );
    const el = ref.current;
    if (el) el.querySelectorAll('.reveal').forEach((c) => observer.observe(c));
    return () => observer.disconnect();
  }, []);
  return ref;
}

export default function RegisterPage() {
  const pageRef = useScrollReveal();
  const { loginWithGoogle } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const handleGoogleSignup = async () => {
    try {
      setError(null);
      setIsGoogleLoading(true);
      await loginWithGoogle();
      router.push('/lobby');
    } catch (err: any) {
      setError(err.message || "Failed to sign up with Google.");
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div ref={pageRef} className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-[#f5f5f7] relative overflow-hidden">
      {/* Subtle Aura Background */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] opacity-40 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at top, rgba(236,72,153,0.1) 0%, transparent 70%)' }} />

      <div className="w-full max-w-[440px] relative z-10">
        
        {/* Simple Centered Logo */}
        <div className="reveal flex flex-col items-center justify-center mb-8">
          <Link href="/" className="flex flex-col items-center gap-3 group no-underline">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-500/20 group-hover:shadow-lg transition-all group-hover:-translate-y-1">
              <MapPin size={24} className="text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight text-slate-900">GroupRoute</span>
          </Link>
        </div>

        {/* Main Card */}
        <div className="reveal reveal-delay-1 bg-white rounded-[24px] shadow-xl shadow-slate-200/50 border border-slate-100 p-8 sm:p-10">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Create an account</h1>
            <p className="text-slate-500 font-medium">Join GroupRoute and start meeting fairly.</p>
          </div>

          {/* Social Logins */}
          <div className="flex flex-col gap-3 mb-8">
            {error && (
              <div className="bg-rose-50 text-rose-600 text-sm font-semibold p-3 rounded-xl border border-rose-100 mb-2">
                {error}
              </div>
            )}
            <button 
              onClick={handleGoogleSignup}
              disabled={isGoogleLoading}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-slate-700 font-semibold text-sm shadow-sm disabled:opacity-50">
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Sign up with Google
            </button>
          </div>

          {/* Divider */}
          <div className="relative flex items-center mb-8">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink-0 px-4 text-xs font-semibold text-slate-400 uppercase tracking-widest">or sign up with email</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          {/* Form */}
          <form className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Full Name</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input type="text" placeholder="John Doe" className="w-full py-3.5 pl-11 pr-4 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none text-slate-900 font-medium placeholder-slate-400" required />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input type="email" placeholder="you@example.com" className="w-full py-3.5 pl-11 pr-4 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none text-slate-900 font-medium placeholder-slate-400" required />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input type="password" placeholder="Create a password (min 8 chars)" className="w-full py-3.5 pl-11 pr-4 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none text-slate-900 font-medium placeholder-slate-400" required />
              </div>
            </div>

            <div className="pt-2">
              <Link href="/lobby" className="block">
                <button type="button" className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-4 rounded-xl transition-all shadow-md hover:shadow-lg active:scale-[0.98]">
                  Create Account
                </button>
              </Link>
            </div>
          </form>
        </div>

        {/* Footer Link */}
        <p className="reveal reveal-delay-2 text-center text-slate-500 text-sm font-medium mt-8">
          Already have an account?{' '}
          <Link href="/login" className="text-indigo-600 hover:text-indigo-700 font-semibold transition-colors">Sign in instead</Link>
        </p>
      </div>
    </div>
  );
}
