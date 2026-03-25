import { Link } from 'react-router-dom';
import { useState } from 'react';
import {
  Bot, Gavel, Shield, TrendingUp, Users, Globe, Sprout, Factory,
  Truck, Star, BarChart3, CheckCircle2, AlertTriangle,
  Cpu, Search, Handshake, ArrowRight, Zap, Target, MessageSquare,
  Play, Eye, Lock, Mail, Phone, MapPin, Send, Twitter, Linkedin,
  Instagram, Youtube, ChevronUp
} from 'lucide-react';

// =============================================================================
// Landing Page — Modern, pitch-deck-informed design
// =============================================================================

// =============================================================================
// Waitlist Section Component
// =============================================================================
function WaitlistSection() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Something went wrong');
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join waitlist. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="py-16 bg-surface-alt border-t border-border-light">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="inline-flex items-center gap-2 bg-accent/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium mb-4">
          <Send size={14} />
          Early Access
        </div>
        <h2 className="text-2xl md:text-3xl font-bold text-text mb-3">
          Join the Waitlist
        </h2>
        <p className="text-text-secondary mb-8">
          Be among the first farmers and buyers to experience AI-powered crop trading.
          We'll notify you when we launch in your region.
        </p>

        {submitted ? (
          <div className="bg-accent/10 rounded-2xl p-6 border border-accent/20">
            <CheckCircle2 className="w-10 h-10 text-accent mx-auto mb-3" />
            <p className="text-lg font-semibold text-text">You're on the list!</p>
            <p className="text-sm text-text-secondary mt-1">
              We'll reach out when CropBid launches in your area.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              disabled={loading}
              className="flex-1 px-5 py-3.5 rounded-xl border border-border bg-surface text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent text-sm disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3.5 bg-primary text-white font-semibold rounded-xl hover:bg-primary-light transition-all shadow-sm hover:shadow-md text-sm shrink-0 inline-flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? 'Joining...' : 'Join Waitlist'}
              {!loading && <ArrowRight size={16} />}
            </button>
          </form>
        )}

        {error && (
          <p className="mt-3 text-sm text-error">{error}</p>
        )}

        <p className="mt-4 text-xs text-text-muted">
          No spam, ever. Unsubscribe anytime.
        </p>
      </div>
    </section>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-surface">
      {/* ================================================================= */}
      {/* Sticky Navbar                                                     */}
      {/* ================================================================= */}
      <nav className="sticky top-0 z-50 bg-surface/80 backdrop-blur-lg border-b border-border-light">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <Link to="/" className="flex items-center">
            <img src="/CropBidlogo.png" alt="CropBid" className="h-[100px]" />
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-text-secondary">
            <a href="/#problem" className="hover:text-primary transition-colors">Problem</a>
            <a href="/#solution" className="hover:text-primary transition-colors">Solution</a>
            <a href="/#platform" className="hover:text-primary transition-colors">Platform</a>
            <a href="/#market" className="hover:text-primary transition-colors">Market</a>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text transition-colors"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              className="px-5 py-2.5 text-sm font-semibold text-white bg-primary rounded-xl hover:bg-primary-light transition-all shadow-sm hover:shadow-md"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ================================================================= */}
      {/* Hero Section                                                      */}
      {/* ================================================================= */}
      <section className="relative overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary-dark via-primary to-primary-light" />
        <div className="absolute inset-0 mesh-gradient opacity-60" />
        {/* Decorative circles */}
        <div className="absolute top-20 right-10 w-72 h-72 bg-accent/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 left-10 w-96 h-96 bg-accent-light/5 rounded-full blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-36 lg:py-40">
          <div className="max-w-3xl">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-1.5 text-sm text-green-100 mb-8 border border-white/10">
              <Zap size={14} className="text-accent-light" />
              <span>AI-Powered Agricultural Marketplace</span>
              <span className="text-accent-light font-medium">|</span>
              <span>Global Platform</span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-[1.1] tracking-tight">
              Where AI Agents
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-light via-green-300 to-emerald-200">
                Negotiate, So Farmers
              </span>
              <br />
              Prosper.
            </h1>

            {/* Sub-headline */}
            <p className="mt-6 text-lg md:text-xl text-green-100/90 max-w-2xl leading-relaxed">
              Every farmer and buyer gets an autonomous AI agent that negotiates, bids,
              and closes deals on their behalf — 24/7, transparently, and fairly.
            </p>

            {/* CTA Buttons */}
            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                to="/signup"
                className="group inline-flex items-center gap-2 px-8 py-4 bg-white text-primary font-semibold rounded-2xl hover:bg-green-50 transition-all shadow-lg hover:shadow-xl animate-pulseGlow text-base"
              >
                Start Trading Free
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <a
                href="/#solution"
                className="inline-flex items-center gap-2 px-8 py-4 text-white font-medium rounded-2xl border border-white/20 hover:bg-white/10 backdrop-blur-sm transition-all text-base"
              >
                <Play size={16} />
                See How It Works
              </a>
            </div>

            {/* Social proof / quick stats */}
            <div className="mt-14 flex flex-wrap gap-8 pt-8 border-t border-white/10">
              {[
                { value: '$5T+', label: 'Global Agri Market' },
                { value: '570M+', label: 'Farms Worldwide' },
                { value: '3', label: 'AI Styles' },
                { value: '0%', label: 'Fee for Farmers' },
              ].map((s) => (
                <div key={s.label}>
                  <p className="text-2xl md:text-3xl font-bold text-white">{s.value}</p>
                  <p className="text-sm text-green-200/70">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================= */}
      {/* Trusted By / Logos Bar                                            */}
      {/* ================================================================= */}
      <section className="py-8 bg-surface border-b border-border-light">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs font-medium text-text-muted uppercase tracking-widest mb-6">
            Trusted Across the Global Agricultural Ecosystem
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16 text-text-muted">
            {['Multi-Currency Support', 'Global Logistics', 'Quality Certified', 'Organic Verified', 'Enterprise Ready'].map((label) => (
              <div key={label} className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 size={14} className="text-accent" />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================= */}
      {/* The Problem                                                       */}
      {/* ================================================================= */}
      <section id="problem" className="py-20 md:py-28 bg-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section header */}
          <div className="max-w-3xl mx-auto text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-error/10 text-error rounded-full px-4 py-1.5 text-sm font-medium mb-4">
              <AlertTriangle size={14} />
              The Problem
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-text leading-tight">
              The Global Agricultural Supply Chain is
              <span className="text-error"> Fundamentally Broken</span>
            </h2>
            <p className="mt-4 text-lg text-text-secondary leading-relaxed">
              From smallholder farms in Asia and Africa to large-scale operations in the Americas,
              the majority of agricultural trade is still controlled by inefficient middlemen.
            </p>
          </div>

          {/* Problem cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: AlertTriangle,
                color: 'text-error',
                bg: 'bg-error/10',
                stat: '40%',
                statLabel: 'value lost',
                title: 'Farmers Lose to Middlemen',
                description: 'Over 570 million farms worldwide lose up to 40% of their crop value to layers of middlemen, opaque pricing, and inefficient manual negotiations.',
              },
              {
                icon: Eye,
                color: 'text-warning',
                bg: 'bg-warning/10',
                stat: '0',
                statLabel: 'market visibility',
                title: 'No Price Transparency',
                description: 'Farmers across continents have no visibility into real-time global market prices, no direct access to international buyers, and no leverage to negotiate fair deals.',
              },
              {
                icon: Search,
                color: 'text-info',
                bg: 'bg-info/10',
                stat: '100s',
                statLabel: 'hours wasted',
                title: 'Buyer Procurement Pain',
                description: 'Food processors, FMCG brands, exporters, and restaurant chains worldwide spend enormous time manually vetting suppliers across borders, dealing with inconsistent quality.',
              },
            ].map((p, i) => {
              const Icon = p.icon;
              return (
                <div
                  key={p.title}
                  className="group relative bg-surface rounded-2xl p-8 border border-border-light hover:border-border hover:shadow-xl transition-all duration-300"
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  <div className={`w-14 h-14 rounded-2xl ${p.bg} flex items-center justify-center mb-5`}>
                    <Icon className={`w-7 h-7 ${p.color}`} />
                  </div>
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className={`text-3xl font-bold ${p.color}`}>{p.stat}</span>
                    <span className="text-sm text-text-muted">{p.statLabel}</span>
                  </div>
                  <h3 className="text-xl font-bold text-text mb-2">{p.title}</h3>
                  <p className="text-text-secondary text-sm leading-relaxed">{p.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================================================================= */}
      {/* The Solution — How It Works                                       */}
      {/* ================================================================= */}
      <section id="solution" className="py-20 md:py-28 bg-surface-alt">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium mb-4">
              <Bot size={14} />
              The Solution
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-text leading-tight">
              Your Own AI Agent That
              <span className="text-gradient"> Negotiates For You</span>
            </h2>
            <p className="mt-4 text-lg text-text-secondary leading-relaxed">
              AI agents handle discovery, quality matching, competitive bidding, counter-offers,
              and deal closure — all within the boundaries you set.
            </p>
          </div>

          {/* Two-column: Farmer & Buyer */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Farmer Side */}
            <div className="bg-surface rounded-3xl p-8 md:p-10 border border-border-light shadow-sm">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <Sprout className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-text">For Farmers</h3>
                  <p className="text-sm text-text-muted">Sell side</p>
                </div>
              </div>

              <div className="space-y-6">
                {[
                  { step: '01', title: 'Onboard Your Farm', desc: 'Tell your AI what you grow, harvest dates, quantity, quality grade, certifications, minimum price, and location.' },
                  { step: '02', title: 'AI Lists & Negotiates', desc: 'Your agent lists produce, responds to buyer bids, makes counter-offers, and closes deals — within your rules.' },
                  { step: '03', title: 'You Stay in Control', desc: 'Set price floors and negotiation style (Aggressive, Balanced, or Conservative). Override anytime.' },
                ].map((item) => (
                  <div key={item.step} className="flex gap-4">
                    <div className="shrink-0">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                        {item.step}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold text-text mb-1">{item.title}</h4>
                      <p className="text-sm text-text-secondary leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Buyer Side */}
            <div className="bg-surface rounded-3xl p-8 md:p-10 border border-border-light shadow-sm">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-info to-blue-400 flex items-center justify-center">
                  <Factory className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-text">For Buyers</h3>
                  <p className="text-sm text-text-muted">Buy side</p>
                </div>
              </div>

              <div className="space-y-6">
                {[
                  { step: '01', title: 'Set Your Standards', desc: 'Configure crop varieties, moisture limits, pesticide residue, budget, delivery timelines, and volume requirements.' },
                  { step: '02', title: 'AI Scans & Bids', desc: 'Your buyer agent scans all listings, evaluates quality against your standards, and places competitive bids automatically.' },
                  { step: '03', title: 'Best Deal Wins', desc: 'When multiple agents compete, a structured auction kicks in with real-time bidding. No middlemen.' },
                ].map((item) => (
                  <div key={item.step} className="flex gap-4">
                    <div className="shrink-0">
                      <div className="w-10 h-10 rounded-xl bg-info/10 flex items-center justify-center text-sm font-bold text-info">
                        {item.step}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-semibold text-text mb-1">{item.title}</h4>
                      <p className="text-sm text-text-secondary leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================= */}
      {/* Platform Features — Bento Grid                                    */}
      {/* ================================================================= */}
      <section id="platform" className="py-20 md:py-28 bg-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-accent/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium mb-4">
              <Cpu size={14} />
              Platform
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-text leading-tight">
              Everything You Need to
              <span className="text-gradient"> Trade Smarter</span>
            </h2>
          </div>

          {/* Bento grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: Cpu, title: 'AI Agent Engine', color: 'from-primary to-accent',
                description: 'Each party gets a personalized AI agent. Farmer agents maximize price. Buyer agents optimize for quality and cost. Both learn from every transaction.',
                span: 'lg:col-span-2',
              },
              {
                icon: Gavel, title: 'Live Auctions', color: 'from-orange-500 to-amber-500',
                description: 'Real-time WebSocket bidding with anti-sniping protection. Multiple buyer agents compete simultaneously.',
                span: '',
              },
              {
                icon: Shield, title: 'Smart Escrow', color: 'from-blue-500 to-cyan-500',
                description: 'Payment held securely on acceptance, released only after delivery confirmation and quality verification.',
                span: '',
              },
              {
                icon: Star, title: 'Trust & Reputation', color: 'from-yellow-500 to-orange-500',
                description: 'Every transaction builds trust scores. Higher trust = priority matching and better deals for both sides.',
                span: '',
              },
              {
                icon: Truck, title: 'Logistics Integration', color: 'from-violet-500 to-purple-500',
                description: 'AI factors logistics cost and delivery time into bids, optimizing total landed cost — not just crop price.',
                span: '',
              },
              {
                icon: BarChart3, title: 'Analytics Dashboard', color: 'from-emerald-500 to-teal-500',
                description: 'Real-time price trends, volume analytics, top crops, and regional insights. Data-driven decisions for everyone.',
                span: '',
              },
              {
                icon: Lock, title: 'Secure by Design', color: 'from-slate-600 to-slate-800',
                description: 'JWT dual-token auth, httpOnly cookies, role-based access control, and encrypted data. Enterprise-grade security.',
                span: '',
              },
            ].map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className={`group relative bg-surface-alt rounded-2xl p-7 border border-border-light hover:border-border hover:shadow-lg transition-all duration-300 ${f.span}`}
                >
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-text mb-2">{f.title}</h3>
                  <p className="text-text-secondary text-sm leading-relaxed">{f.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================================================================= */}
      {/* Target Customers                                                  */}
      {/* ================================================================= */}
      <section className="py-20 md:py-28 bg-surface-alt">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium mb-4">
              <Users size={14} />
              Who It's For
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-text">
              Built for Both Sides
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* Sell Side */}
            <div className="bg-surface rounded-3xl p-8 border border-border-light shadow-sm hover:shadow-md transition-shadow">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-6">
                <Sprout className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-text mb-2">Sell Side — Farmers</h3>
              <p className="text-text-secondary text-sm leading-relaxed mb-6">
                Small and mid-size farmers worldwide. Over 570 million farms globally,
                many organized into cooperatives and producer organizations for seamless onboarding.
              </p>
              <div className="space-y-3">
                {['Better prices, no middlemen', 'Faster payments via escrow', 'Direct access to global buyers', 'Cooperative & co-op aggregation', 'Zero platform fees for farmers'].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <CheckCircle2 size={18} className="text-accent shrink-0" />
                    <span className="text-sm text-text">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Buy Side */}
            <div className="bg-surface rounded-3xl p-8 border border-border-light shadow-sm hover:shadow-md transition-shadow">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-info to-blue-400 flex items-center justify-center mb-6">
                <Factory className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-text mb-2">Buy Side — Companies</h3>
              <p className="text-text-secondary text-sm leading-relaxed mb-6">
                Food processors, FMCG brands, restaurant chains, exporters, and retail
                chains across the globe procuring agricultural commodities at scale.
              </p>
              <div className="space-y-3">
                {['AI-automated procurement', 'Cross-border quality assurance', 'Global supply chain', 'Multi-currency transactions', 'Competitive pricing at scale'].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <CheckCircle2 size={18} className="text-info shrink-0" />
                    <span className="text-sm text-text">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================= */}
      {/* Market Opportunity                                                */}
      {/* ================================================================= */}
      <section id="market" className="relative py-20 md:py-28 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-dark via-primary to-primary-light" />
        <div className="absolute inset-0 mesh-gradient opacity-40" />
        <div className="absolute top-0 right-0 w-96 h-96 bg-accent/10 rounded-full blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-white/10 text-green-100 rounded-full px-4 py-1.5 text-sm font-medium mb-4 border border-white/10">
              <TrendingUp size={14} />
              Market Opportunity
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-tight">
              A $5 Trillion Market,
              <br />
              <span className="text-accent-light">Massively Untapped</span>
            </h2>
            <p className="mt-4 text-lg text-green-100/80 leading-relaxed">
              Global digital agriculture initiatives — from India's eNAM to the EU's Farm-to-Fork
              strategy — are creating massive opportunity for AI-driven trading platforms.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { value: '$5T+', label: 'Global agricultural market' },
              { value: '<5%', label: 'Traded through digital platforms' },
              { value: '570M+', label: 'Farms worldwide underserved' },
            ].map((stat) => (
              <div key={stat.label} className="glass-card rounded-2xl p-8 text-center">
                <p className="text-4xl md:text-5xl font-bold text-white mb-2">{stat.value}</p>
                <p className="text-sm text-green-200/70">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================= */}
      {/* Competitive Advantage                                             */}
      {/* ================================================================= */}
      <section className="py-20 md:py-28 bg-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-accent/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium mb-4">
              <Target size={14} />
              Why CropBid
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-text">
              No One Else Does This
            </h2>
            <p className="mt-4 text-text-secondary">
              Existing platforms focus on inputs, advisory, or logistics.
              None offer autonomous AI agents that negotiate deals.
            </p>
          </div>

          <div className="max-w-3xl mx-auto">
            <div className="rounded-2xl border border-border-light overflow-hidden bg-surface shadow-sm">
              <div className="grid grid-cols-12 bg-primary-dark text-white text-sm font-semibold">
                <div className="col-span-3 px-5 py-4">Platform</div>
                <div className="col-span-5 px-5 py-4">Focus Area</div>
                <div className="col-span-4 px-5 py-4 text-center">AI Agent Negotiation</div>
              </div>
              {[
                { name: 'Indigo Ag', focus: 'Grain marketplace & carbon', ai: false },
                { name: 'Farmers Business Network', focus: 'Input procurement & analytics', ai: false },
                { name: 'Ninjacart / DeHaat', focus: 'Regional agri logistics', ai: false },
                { name: 'CropBid', focus: 'AI-agent-driven marketplace', ai: true },
              ].map((row) => (
                <div
                  key={row.name}
                  className={`grid grid-cols-12 text-sm border-t border-border-light transition-colors ${row.ai ? 'bg-accent/5' : 'hover:bg-surface-alt'}`}
                >
                  <div className={`col-span-3 px-5 py-4 font-medium ${row.ai ? 'text-primary font-bold' : 'text-text'}`}>
                    {row.ai && <span className="mr-1">🌾</span>}{row.name}
                  </div>
                  <div className="col-span-5 px-5 py-4 text-text-secondary">{row.focus}</div>
                  <div className="col-span-4 px-5 py-4 text-center">
                    {row.ai ? (
                      <span className="inline-flex items-center gap-1.5 text-accent font-bold">
                        <CheckCircle2 size={16} /> Yes — First mover
                      </span>
                    ) : (
                      <span className="text-text-muted">No</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================= */}
      {/* Revenue Model                                                     */}
      {/* ================================================================= */}
      <section className="py-20 md:py-28 bg-surface-alt">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium mb-4">
              <BarChart3 size={14} />
              Business Model
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-text">
              Three Revenue Streams
            </h2>
            <p className="mt-3 text-lg text-text-secondary">
              Free for farmers. Revenue scales with marketplace growth.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              {
                tag: 'Primary', title: 'Transaction Fee', subtitle: '1-3% per deal',
                color: 'from-primary to-accent',
                description: 'Commission on every successful deal, paid entirely by buyers. Revenue scales directly with volume flowing through the marketplace.',
              },
              {
                tag: 'Secondary', title: 'SaaS Subscription', subtitle: 'Monthly/Annual',
                color: 'from-info to-blue-400',
                description: 'Premium AI capabilities for enterprise buyers — predictive pricing, advanced analytics, priority matching, and custom procurement workflows.',
              },
              {
                tag: 'Tertiary', title: 'Partner Commissions', subtitle: 'Per referral',
                color: 'from-violet-500 to-purple-500',
                description: 'Referral fees from logistics providers, warehousing, crop insurance, and farm financing partners integrated into the platform.',
              },
            ].map((stream) => (
              <div
                key={stream.title}
                className="bg-surface rounded-2xl p-7 border border-border-light hover:shadow-lg transition-all duration-300"
              >
                <div className={`inline-block px-3 py-1 rounded-lg text-xs font-bold text-white bg-gradient-to-r ${stream.color} mb-4`}>
                  {stream.tag}
                </div>
                <h3 className="text-xl font-bold text-text">{stream.title}</h3>
                <p className="text-sm font-medium text-text-muted mb-3">{stream.subtitle}</p>
                <p className="text-text-secondary text-sm leading-relaxed">{stream.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================= */}
      {/* Growth Strategy                                                   */}
      {/* ================================================================= */}
      <section className="py-20 md:py-28 bg-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium mb-4">
              <Globe size={14} />
              Growth
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-text">
              Customer Acquisition Strategy
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto mb-8">
            <div className="bg-surface-alt rounded-2xl p-8 border border-border-light">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
                  <Target className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-text">Early Stage</h3>
                  <p className="text-xs text-text-muted">Now</p>
                </div>
              </div>
              <p className="text-text-secondary text-sm leading-relaxed">
                Start in key agricultural hubs — one crop, one region. Partner with cooperatives
                to onboard hundreds of farmers at once. Approach mid-size food processors:
              </p>
              <div className="mt-4 bg-surface rounded-xl p-4 border border-border-light">
                <p className="text-sm font-medium text-primary italic">
                  "We will reduce your procurement cost by 15% and guarantee quality compliance."
                </p>
              </div>
            </div>

            <div className="bg-surface-alt rounded-2xl p-8 border border-border-light">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Globe className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-text">At Scale</h3>
                  <p className="text-xs text-text-muted">12-24 months</p>
                </div>
              </div>
              <p className="text-text-secondary text-sm leading-relaxed">
                Expand across continents through cooperative partnerships, government digital agriculture programs,
                and enterprise sales teams targeting procurement heads with API integrations.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {['Cooperative Network', 'Govt. Programs', 'Referrals', 'Enterprise API'].map((ch) => (
                  <span key={ch} className="text-xs bg-primary/10 text-primary px-3 py-1 rounded-full font-medium">{ch}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Channels */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {[
              { icon: Handshake, ch: 'Partnerships', desc: 'Cooperative partnerships, government integrations, global logistics providers', side: 'Both Sides' },
              { icon: MessageSquare, ch: 'Direct Sales', desc: 'Enterprise sales targeting procurement heads across continents with ROI pitch', side: 'Buy Side' },
              { icon: Users, ch: 'Community', desc: 'Farmer referral bonuses, word-of-mouth in farming communities worldwide', side: 'Sell Side' },
            ].map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.ch} className="flex items-start gap-3 bg-surface-alt rounded-xl p-5 border border-border-light">
                  <Icon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-text text-sm">{c.ch}</p>
                    <p className="text-xs text-text-secondary mt-1">{c.desc}</p>
                    <span className="inline-block mt-2 text-xs bg-primary/10 text-primary px-2.5 py-0.5 rounded-full font-medium">{c.side}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================================================================= */}
      {/* Vision + Final CTA                                                */}
      {/* ================================================================= */}
      <section className="relative py-24 md:py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-dark via-primary to-accent" />
        <div className="absolute inset-0 mesh-gradient opacity-50" />
        <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-tight mb-6">
            The Trading Floor
            <br />
            for Agriculture
          </h2>
          <p className="text-lg text-green-100/80 leading-relaxed max-w-3xl mx-auto mb-4">
            CropBid envisions a future where every farmer has an intelligent digital
            representative ensuring fair value, and every buyer has an agent guaranteeing
            quality and efficiency at scale.
          </p>
          <p className="text-green-200/60 mb-10 max-w-2xl mx-auto">
            Replacing middlemen with intelligence. Replacing opacity with data.
            Replacing inefficiency with autonomous negotiation. Built for every
            farmer and buyer, everywhere.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/signup"
              className="group inline-flex items-center gap-2 px-10 py-4 bg-white text-primary font-bold rounded-2xl hover:bg-green-50 transition-all shadow-lg hover:shadow-xl text-lg"
            >
              Join CropBid Today
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-8 py-4 text-white font-medium rounded-2xl border border-white/20 hover:bg-white/10 transition-all"
            >
              Login to Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* ================================================================= */}
      {/* Waitlist Section                                                  */}
      {/* ================================================================= */}
      <WaitlistSection />

      {/* ================================================================= */}
      {/* Footer                                                            */}
      {/* ================================================================= */}
      <footer className="bg-primary-dark text-white">
        {/* Main footer */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">
            {/* Brand */}
            <div className="lg:col-span-1">
              <div className="flex items-center mb-4">
                <img src="/CropBidlogo.png" alt="CropBid" className="h-[100px] brightness-0 invert" />
              </div>
              <p className="text-green-200/70 text-sm leading-relaxed mb-6">
                AI-Powered Agricultural Marketplace where every farmer and buyer gets an autonomous
                AI agent that negotiates the best deals.
              </p>
              {/* Social links */}
              <div className="flex items-center gap-3">
                {[
                  { icon: Twitter, label: 'Twitter', href: '#' },
                  { icon: Linkedin, label: 'LinkedIn', href: '#' },
                  { icon: Instagram, label: 'Instagram', href: '#' },
                  { icon: Youtube, label: 'YouTube', href: '#' },
                ].map((social) => {
                  const Icon = social.icon;
                  return (
                    <a
                      key={social.label}
                      href={social.href}
                      aria-label={social.label}
                      className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center hover:bg-accent transition-colors"
                    >
                      <Icon size={18} />
                    </a>
                  );
                })}
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-green-200/50 mb-4">Platform</h4>
              <ul className="space-y-3">
                {[
                  { label: 'How It Works', href: '/#solution' },
                  { label: 'For Farmers', href: '/#solution' },
                  { label: 'For Buyers', href: '/#solution' },
                  { label: 'Live Auctions', href: '/#platform' },
                  { label: 'AI Agents', href: '/#platform' },
                  { label: 'Pricing', href: '/#market' },
                ].map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="text-sm text-green-200/70 hover:text-white transition-colors">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-green-200/50 mb-4">Company</h4>
              <ul className="space-y-3">
                {[
                  { label: 'About Us', href: '/#problem' },
                  { label: 'Careers', href: '#' },
                  { label: 'Blog', href: '#' },
                  { label: 'Press Kit', href: '#' },
                  { label: 'Privacy Policy', href: '#' },
                  { label: 'Terms of Service', href: '#' },
                ].map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="text-sm text-green-200/70 hover:text-white transition-colors">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="text-sm font-semibold uppercase tracking-wider text-green-200/50 mb-4">Get in Touch</h4>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <Mail size={16} className="text-accent shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-green-200/70">Email us</p>
                    <a href="mailto:hello@cropbid.com" className="text-sm font-medium hover:text-accent transition-colors">
                      hrishikeshborkar94@gmail.com
                    </a>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <Phone size={16} className="text-accent shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-green-200/70">Call us</p>
                    <a href="tel:+911234567890" className="text-sm font-medium hover:text-accent transition-colors">
                      +91 9307098019
                    </a>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <MapPin size={16} className="text-accent shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-green-200/70">Office</p>
                    <p className="text-sm font-medium">Nagpur, India</p>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <p className="text-sm text-green-200/50">
                &copy; {new Date().getFullYear()} CropBid AI. All rights reserved.
              </p>
              <div className="flex items-center gap-6 text-sm text-green-200/50">
                <span>AgTech / AI-ML</span>
                <span className="w-1 h-1 rounded-full bg-green-200/30" />
                <span>Global Platform</span>
                <span className="w-1 h-1 rounded-full bg-green-200/30" />
                <span>15+ Countries</span>
              </div>
              {/* Back to top */}
              <a
                href="#"
                className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center hover:bg-accent transition-colors"
                aria-label="Back to top"
              >
                <ChevronUp size={18} />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
