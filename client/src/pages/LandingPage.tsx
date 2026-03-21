// =============================================================================
// Landing Page — The first thing visitors see
// =============================================================================

import { Link } from 'react-router-dom';
import { Bot, Gavel, Shield, TrendingUp, Users, Globe } from 'lucide-react';
import { Button } from '../components/ui/Button';

const FEATURES = [
  {
    icon: Bot,
    title: 'AI-Powered Negotiation',
    description: 'Intelligent agents negotiate the best price on your behalf using Google Gemini AI.',
  },
  {
    icon: Gavel,
    title: 'Live Auctions',
    description: 'Real-time bidding with anti-sniping protection and instant settlement.',
  },
  {
    icon: Shield,
    title: 'Escrow Protection',
    description: 'Secure escrow holds funds until delivery is confirmed. Both parties protected.',
  },
  {
    icon: TrendingUp,
    title: 'Smart Matching',
    description: 'AI scores listings to find the best matches based on your preferences.',
  },
  {
    icon: Users,
    title: 'Trust Scores',
    description: 'Build reputation through successful transactions. Higher trust = better deals.',
  },
  {
    icon: Globe,
    title: 'India-First, Global Ready',
    description: 'Built for Indian agriculture with mandi prices, APMC integration, and multi-currency support.',
  },
];

const STATS = [
  { value: '20+', label: 'Crop Types' },
  { value: '10+', label: 'Indian States' },
  { value: '3', label: 'AI Negotiation Styles' },
  { value: '2%', label: 'Platform Fee' },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-surface">
      {/* Navbar */}
      <nav className="bg-primary text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🌾</span>
            <span className="text-xl font-bold">CropBid</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost" className="text-white hover:bg-primary-light">
                Login
              </Button>
            </Link>
            <Link to="/signup">
              <Button className="bg-accent hover:bg-accent-dark">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-gradient-to-br from-primary via-primary-light to-accent text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight">
              Where AI Agents
              <br />
              <span className="text-accent-light">Negotiate Crop Deals</span>
            </h1>
            <p className="mt-6 text-lg md:text-xl text-green-100 max-w-2xl">
              CropBid is the B2B agricultural marketplace where AI-powered agents
              negotiate the best prices for farmers and buyers — automatically.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link to="/signup">
                <Button size="lg" className="bg-white text-primary hover:bg-green-50 font-semibold px-8">
                  Start Trading
                </Button>
              </Link>
              <Link to="/login">
                <Button size="lg" variant="outline" className="border-white text-white hover:bg-primary-light px-8">
                  Login
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="bg-primary-dark text-white py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {STATS.map((stat) => (
              <div key={stat.label}>
                <p className="text-3xl font-bold text-accent-light">{stat.value}</p>
                <p className="text-sm text-green-200">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 md:py-24 bg-surface-alt">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-text-primary">
              Everything You Need to Trade Crops
            </h2>
            <p className="mt-4 text-lg text-text-secondary max-w-2xl mx-auto">
              From AI-powered price negotiation to secure escrow payments,
              CropBid handles the entire deal lifecycle.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="bg-surface rounded-xl p-6 border border-border-light hover:shadow-lg transition-shadow"
                >
                  <div className="w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-text-primary mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-text-secondary text-sm">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 md:py-24 bg-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold text-text-primary text-center mb-12">
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              { step: '1', title: 'List Your Crop', desc: 'Farmers create listings with price range, quality grade, and photos.' },
              { step: '2', title: 'Configure AI Agent', desc: 'Set your price boundaries and negotiation style (aggressive, balanced, conservative).' },
              { step: '3', title: 'AI Negotiates', desc: 'Your AI agent negotiates with buyer agents to find the best deal.' },
              { step: '4', title: 'Secure Settlement', desc: 'Escrow protects both parties. Payment releases on delivery confirmation.' },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center text-xl font-bold mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="font-semibold text-text-primary mb-2">{item.title}</h3>
                <p className="text-sm text-text-secondary">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary text-white py-16">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Transform Your Crop Trading?</h2>
          <p className="text-green-100 mb-8">
            Join farmers and buyers across India who are already using AI to get better deals.
          </p>
          <Link to="/signup">
            <Button size="lg" className="bg-accent hover:bg-accent-dark px-10 font-semibold">
              Create Free Account
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-primary-dark text-green-200 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">🌾</span>
              <span className="font-bold text-white">CropBid</span>
              <span className="text-sm">— AI-Powered Agricultural Marketplace</span>
            </div>
            <p className="text-sm">Built with React, Express, Prisma, Socket.io, and Gemini AI</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
