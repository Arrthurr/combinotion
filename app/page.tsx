import Link from "next/link";
import { ArrowRight, BookOpen, Heart, School, Sparkles, Users } from "lucide-react";

export default function Home() {
  return (
    <main id="content" className="landing-page">
      <nav className="public-nav" aria-label="Main navigation">
        <Link className="brand brand-dark" href="/" aria-label="Joy for Books home">
          <span className="brand-mark" aria-hidden="true">
            <BookOpen size={21} strokeWidth={2.2} />
          </span>
          <span>
            <strong>Joy for Books</strong>
            <small>Books create possibility</small>
          </span>
        </Link>
        <Link className="text-link" href="/books">
          Staff workspace <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow"><Sparkles size={15} aria-hidden="true" /> Community-powered reading</p>
          <h1>Good books should find every young reader.</h1>
          <p className="hero-lede">
            We connect donated books with Arizona schools—making every request,
            delivery, and reading moment count.
          </p>
          <div className="hero-actions">
            <Link className="button" href="/request-books">
              Request books <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <span>No cost to schools</span>
          </div>
          <div className="trust-row" aria-label="Program values">
            <div><BookOpen size={18} /><span><strong>Curated titles</strong><small>Chosen for young readers</small></span></div>
            <div><School size={18} /><span><strong>School focused</strong><small>Simple request process</small></span></div>
            <div><Users size={18} /><span><strong>Visit ready</strong><small>Packed for classrooms</small></span></div>
          </div>
        </div>

        <div className="hero-art" aria-label="Books moving from community shelves to a school">
          <div className="sun-shape" />
          <div className="art-card art-card-top">
            <Heart size={20} fill="currentColor" />
            <span><strong>Community donated</strong><small>Stories ready for a new home</small></span>
          </div>
          <div className="book-stack" aria-hidden="true">
            <span className="book book-one" />
            <span className="book book-two" />
            <span className="book book-three" />
            <span className="book book-four" />
            <span className="book-pages" />
          </div>
          <div className="art-card art-card-bottom">
            <span className="art-icon"><School size={20} /></span>
            <span><strong>Delivered with care</strong><small>Directly to school communities</small></span>
          </div>
          <span className="doodle doodle-one">✦</span>
          <span className="doodle doodle-two">✦</span>
        </div>
      </section>

      <section className="impact-strip" aria-label="How the program works">
        <p>From shelf to school</p>
        <ol>
          <li><span>01</span><strong>Schools request</strong><small>Browse available books</small></li>
          <li><span>02</span><strong>We prepare</strong><small>Reserve and pack each order</small></li>
          <li><span>03</span><strong>Readers discover</strong><small>Books arrive ready to share</small></li>
        </ol>
      </section>
    </main>
  );
}
