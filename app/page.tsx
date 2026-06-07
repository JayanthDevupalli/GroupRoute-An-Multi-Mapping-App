'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowRight, MapPin, Shield, Zap, Users, ChevronRight, Globe, Lock, Menu } from 'lucide-react';

function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add('visible');
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );
    const el = ref.current;
    if (el) el.querySelectorAll('.reveal').forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, []);
  return ref;
}

/* ═══════ Hero Orbit Visual ═══════ */
function HeroVisual() {
  return (
    <div className="relative w-[280px] h-[280px] md:w-[380px] md:h-[380px] mx-auto group">
      {/* Dynamic aura glow */}
      <div className="absolute inset-[-40px] rounded-full opacity-60 pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, rgba(236,72,153,0.08) 50%, transparent 70%)',
          animation: 'pulse-glow 6s ease-in-out infinite alternate'
        }} />

      {/* Rotating Rings */}
      <div className="absolute inset-0 rounded-full border border-dashed border-indigo-300/60"
        style={{ animation: 'spin-slow 24s linear infinite' }} />
      <div className="absolute inset-[18%] rounded-full border border-indigo-300/80"
        style={{ animation: 'spin-slow-reverse 18s linear infinite' }} />
      <div className="absolute inset-[36%] rounded-full border-2 border-indigo-200 shadow-[inset_0_0_20px_rgba(99,102,241,0.1)]"
        style={{ animation: 'pulse-ring 4s ease-in-out infinite' }} />

      {/* Center pin */}
      <div className="absolute inset-0 flex items-center justify-center z-10">
        <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-xl shadow-indigo-500/40 border-[3px] border-white relative group-hover:scale-105 transition-transform duration-500">
          <div className="absolute inset-0 rounded-full bg-white opacity-20" style={{ animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite' }} />
          <MapPin className="text-white relative z-10" size={24} />
        </div>
      </div>

      {/* Orbiting user dots with trails/connecting lines */}
      {[
        { delay: '0s', duration: '12s', color: 'from-rose-400 to-pink-500', label: 'A', shadow: 'shadow-rose-400/40', radius: '190px' },
        { delay: '-4s', duration: '16s', color: 'from-emerald-400 to-teal-500', label: 'S', shadow: 'shadow-emerald-400/40', radius: '155px' },
        { delay: '-8s', duration: '10s', color: 'from-amber-400 to-orange-500', label: 'M', shadow: 'shadow-amber-400/40', radius: '110px' },
      ].map((dot, i) => (
        <div key={i} className="absolute inset-0 flex items-center justify-center"
          style={{
            animation: `orbit ${dot.duration} linear infinite`,
            animationDelay: dot.delay,
            // @ts-expect-error CSS custom property
            '--orbit-radius': dot.radius,
          }}>
          <div className={`w-10 h-10 md:w-11 md:h-11 rounded-full bg-gradient-to-br ${dot.color} flex items-center justify-center text-white font-bold text-[13px] shadow-lg ${dot.shadow} border-2 border-white relative z-20 hover:scale-110 transition-transform cursor-pointer`}>
            {dot.label}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════ MAIN PAGE ═══════ */
export default function Home() {
  const pageRef = useScrollReveal();

  return (
    <div ref={pageRef} style={{ backgroundColor: '#ffffff' }}>

      {/* ═══════ NAVBAR — Big, visible, unique ═══════ */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/60">
        <div className="max-w-[1120px] mx-auto h-16 flex items-center justify-between px-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 no-underline group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-500/20 group-hover:shadow-lg group-hover:shadow-indigo-500/30 transition-shadow">
              <MapPin size={18} className="text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight text-slate-900">GroupRoute</span>
          </Link>

          {/* Center Links */}
          <div className="hidden md:flex items-center gap-8">
            <Link href="#features" className="text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors">Features</Link>
            <Link href="#how-it-works" className="text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors">How It Works</Link>
            <Link href="#stats" className="text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors">Stats</Link>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-semibold text-slate-700 hover:text-indigo-600 transition-colors hidden sm:block">
              Sign In
            </Link>
            <Link href="/register" className="text-sm font-semibold bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-full transition-all shadow-sm hover:shadow-md">
              Get Started
            </Link>
            <button className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors text-slate-600">
              <Menu size={20} />
            </button>
          </div>
        </div>
      </nav>

      {/* ═══════ HERO — Two column: text left, orbit right ═══════ */}
      <section className="px-6 pt-20 pb-28 aura-section" style={{ backgroundColor: '#ffffff' }}>
        <div className="max-w-[1120px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          {/* Left: Text Content */}
          <div>
            <div className="reveal">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-sm font-semibold mb-8">
                <Zap size={14} /> Introducing GroupRoute
              </span>
            </div>

            <h1 className="reveal reveal-delay-1 hero-display mb-6 text-slate-900">
              The fairest way<br />
              <span className="gradient-text-hero">to meet up.</span>
            </h1>

            <p className="reveal reveal-delay-2 section-subhead mb-10 max-w-[480px]">
              One link. Everyone shares their location. GroupRoute finds the mathematically perfect center for your group.
            </p>

            <div className="reveal reveal-delay-3 flex flex-col sm:flex-row items-start gap-4">
              <Link href="/register" className="btn-primary">
                Start for Free <ArrowRight size={18} />
              </Link>
              <Link href="#how-it-works" className="btn-secondary">
                How it works <ChevronRight size={18} />
              </Link>
            </div>

            {/* Trust badges */}
            <div className="reveal reveal-delay-4 flex items-center gap-6 mt-10 pt-10 border-t border-slate-100">
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-900">100%</div>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Fair</div>
              </div>
              <div className="w-px h-10 bg-slate-200" />
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-900">&lt;50ms</div>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Compute</div>
              </div>
              <div className="w-px h-10 bg-slate-200" />
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-900">0</div>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Data Stored</div>
              </div>
            </div>
          </div>

          {/* Right: Orbit Visual */}
          <div className="reveal reveal-delay-3 flex items-center justify-center">
            <HeroVisual />
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* ═══════ FEATURES ═══════ */}
      <section id="features" className="py-28 px-6" style={{ backgroundColor: '#f5f5f7' }}>
        <div className="max-w-[1120px] mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="reveal text-indigo-600 text-sm font-semibold tracking-wide uppercase mb-4">Why GroupRoute</p>
            <h2 className="reveal reveal-delay-1 section-headline text-slate-900">
              Built for groups<br />who value fairness.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: <Lock className="text-indigo-600" size={26} />,
                bg: 'bg-indigo-50', border: 'border-indigo-100',
                title: 'Gatekeeper Lobby',
                desc: 'Private, secure sessions with unique invite codes. Only your friends get in — no strangers, no tracking.',
              },
              {
                icon: <Globe className="text-violet-600" size={26} />,
                bg: 'bg-violet-50', border: 'border-violet-100',
                title: 'Dynamic Map Canvas',
                desc: 'Watch routes appear in real-time on an interactive map as GroupRoute computes the geometric center.',
              },
              {
                icon: <Users className="text-rose-600" size={26} />,
                bg: 'bg-rose-50', border: 'border-rose-100',
                title: 'True Fairness',
                desc: 'Geometric median ensures no one travels disproportionately. Mathematically optimal, inherently fair.',
              },
            ].map((f, i) => (
              <div key={i} className={`reveal reveal-delay-${i + 2} surface-card p-9`}>
                <div className={`icon-container ${f.bg} border ${f.border} mb-6`}>
                  {f.icon}
                </div>
                <h3 className="text-xl font-bold tracking-tight mb-3 text-slate-900">{f.title}</h3>
                <p className="text-slate-500 text-[15px] leading-relaxed font-medium">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* ═══════ HOW IT WORKS ═══════ */}
      <section id="how-it-works" className="py-28 px-6 aura-section" style={{ backgroundColor: '#ffffff' }}>
        <div className="max-w-[1120px] mx-auto relative z-10">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="reveal text-emerald-600 text-sm font-semibold tracking-wide uppercase mb-4">How It Works</p>
            <h2 className="reveal reveal-delay-1 section-headline text-slate-900">
              Three steps.<br />Zero effort.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8">
            {[
              { step: '01', title: 'Create a Session', desc: 'Generate a unique room code and share it with your group. Takes less than 3 seconds.', gradient: 'gradient-text-blue' },
              { step: '02', title: 'Everyone Joins', desc: 'Friends enter the code and securely share their location. No accounts needed for guests.', gradient: 'gradient-text-purple' },
              { step: '03', title: 'Meet in the Middle', desc: 'GroupRoute computes the optimal meeting point and shows routes for everyone on the map.', gradient: 'gradient-text-pink' },
            ].map((item, i) => (
              <div key={i} className={`reveal reveal-delay-${i + 2} text-center md:text-left`}>
                <span className={`${item.gradient} text-7xl font-extrabold tracking-tighter block mb-6`}>{item.step}</span>
                <h3 className="text-2xl font-bold tracking-tight mb-3 text-slate-900">{item.title}</h3>
                <p className="text-slate-500 text-[15px] leading-relaxed font-medium">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* ═══════ STATS ═══════ */}
      <section id="stats" className="py-28 px-6" style={{ backgroundColor: '#f5f5f7' }}>
        <div className="max-w-[1120px] mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 text-center">
            {[
              { value: '<50ms', label: 'Compute Time' },
              { value: '0', label: 'Data Stored' },
              { value: '∞', label: 'Group Size' },
              { value: '100%', label: 'Fair Routes' },
            ].map((stat, i) => (
              <div key={i} className={`reveal reveal-delay-${i + 1}`}>
                <div className="text-4xl md:text-5xl font-bold tracking-tight mb-2 gradient-text-hero">{stat.value}</div>
                <div className="text-sm font-semibold text-slate-400 uppercase tracking-wider">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="section-divider" />

      {/* ═══════ CTA ═══════ */}
      <section className="py-28 px-6 aura-section" style={{ backgroundColor: '#ffffff' }}>
        <div className="relative z-10 text-center max-w-3xl mx-auto">
          <h2 className="reveal section-headline mb-6 text-slate-900">Ready to find<br />your perfect center?</h2>
          <p className="reveal reveal-delay-1 section-subhead mb-12 text-slate-500">Start a session in seconds. No credit card, no sign-up hassle.</p>
          <div className="reveal reveal-delay-2">
            <Link href="/register" className="btn-primary text-lg px-12 py-5">
              Get Started — It&apos;s Free <ArrowRight size={20} />
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════ FOOTER ═══════ */}
      <footer className="border-t border-slate-200 py-8 px-6" style={{ backgroundColor: '#f5f5f7' }}>
        <div className="max-w-[1120px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <MapPin size={14} className="text-slate-400" />
            <span className="text-xs font-medium text-slate-400">© 2026 GroupRoute. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="#" className="text-xs font-medium text-slate-400 hover:text-slate-700 transition-colors">Privacy</Link>
            <Link href="#" className="text-xs font-medium text-slate-400 hover:text-slate-700 transition-colors">Terms</Link>
            <Link href="#" className="text-xs font-medium text-slate-400 hover:text-slate-700 transition-colors">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
