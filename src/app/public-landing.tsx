import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  FileText,
  MessageSquare,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { CollabryBrand, CollabryMark } from "@/components/collabry-brand";

const heroWallTiles = [
  ["violet-sculpture.svg", "feature"], ["workspace-scene.svg", "wide"], ["document-stack.svg", "tall"], ["coral-composition.svg", "small"],
  ["sky-study.svg", "tall"], ["color-board.svg", "feature"], ["mint-forms.svg", "wide"], ["team-notes.svg", "small"],
  ["document-stack.svg", "wide"], ["violet-sculpture.svg", "small"], ["workspace-scene.svg", "feature"], ["sky-study.svg", "small"],
  ["coral-composition.svg", "tall"], ["team-notes.svg", "wide"], ["mint-forms.svg", "feature"], ["color-board.svg", "small"],
  ["sky-study.svg", "wide"], ["document-stack.svg", "small"], ["coral-composition.svg", "feature"], ["workspace-scene.svg", "small"],
  ["color-board.svg", "tall"], ["mint-forms.svg", "wide"], ["team-notes.svg", "feature"], ["violet-sculpture.svg", "small"],
  ["workspace-scene.svg", "wide"], ["coral-composition.svg", "small"], ["sky-study.svg", "feature"], ["document-stack.svg", "small"],
  ["mint-forms.svg", "tall"], ["color-board.svg", "wide"], ["violet-sculpture.svg", "feature"], ["team-notes.svg", "small"],
];

function HeroImageWall() {
  return (
    <div className="landing-image-wall" aria-hidden="true">
      <div className="landing-image-wall-grid">
        {heroWallTiles.map(([image, size], index) => (
          <div
            key={`${image}-${index}`}
            className={`landing-wall-tile landing-wall-tile-${size}`}
            style={{ backgroundImage: `url("/landing-wall/${image}")` }}
          />
        ))}
      </div>
      <div className="landing-image-wall-shade" />
    </div>
  );
}

function ProductPreview() {
  return (
    <div role="img" aria-label="Illustration of a Collabry shared workspace and document" className="landing-rise relative mx-auto w-full max-w-[660px] lg:ml-auto">
      <span className="landing-preview-label">Illustrative product preview</span>
      <div className="landing-aura absolute -inset-x-10 -bottom-10 -top-8 rounded-[40px]" />
      <div className="landing-window relative overflow-hidden rounded-[22px] border border-[#dce2e8] bg-[#fcfcfb] shadow-[0_40px_100px_-52px_rgba(12,24,40,.58)] ring-1 ring-white/70">
        <div className="flex h-12 items-center gap-2 border-b border-[#e8ebed] bg-white/90 px-4 sm:px-5">
          <span className="h-2 w-2 rounded-full bg-[#d2d6d9]" /><span className="h-2 w-2 rounded-full bg-[#d2d6d9]" /><span className="h-2 w-2 rounded-full bg-[#d2d6d9]" />
          <div className="ml-4 hidden h-7 flex-1 items-center rounded-md border border-[#edf0f1] bg-[#f8f9f8] px-3 text-[10px] text-[#79838e] sm:flex">collabry / product studio / direction</div>
          <div className="landing-saved-pill ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[9px] font-medium"><span className="h-1.5 w-1.5 rounded-full bg-[#4b9b75]" /> Saved</div>
        </div>
        <div className="grid min-h-[370px] grid-cols-[108px_1fr] sm:min-h-[430px] sm:grid-cols-[150px_1fr]">
          <aside className="border-r border-[#e8ebed] bg-[#f5f6f5] px-2.5 py-4 sm:px-3.5">
            <div className="flex items-center gap-2 px-1"><CollabryMark size={30} /><span className="hidden text-[11px] font-semibold tracking-tight text-[#29384a] sm:inline">Collabry</span></div>
            <p className="mb-2 mt-6 px-1 text-[8px] font-semibold uppercase tracking-[.16em] text-[#8c969e]">Workspace</p>
            <div className="landing-preview-active flex items-center gap-2 rounded-md px-2 py-2 text-[9px] font-medium sm:text-[10px]"><span className="h-1.5 w-1.5 rounded-full bg-[#7966dc]" /> Product studio</div>
            <div className="mt-1 flex items-center gap-2 px-2 py-2 text-[9px] text-[#77818a] sm:text-[10px]"><span className="h-1.5 w-1.5 rounded-full bg-[#aaa5bd]" /> Brand refresh</div>
            <div className="mt-1 flex items-center gap-2 px-2 py-2 text-[9px] text-[#77818a] sm:text-[10px]"><span className="h-1.5 w-1.5 rounded-full bg-[#8da9a2]" /> Team handbook</div>
            <div className="mt-7 border-t border-[#e1e5e5] pt-4">
              <p className="px-1 text-[8px] font-semibold uppercase tracking-[.16em] text-[#8c969e]">Workspace access</p>
              <div className="mt-3 flex items-center gap-2 px-1"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#dbe4e8] text-[8px] font-semibold text-[#425968]">A</span><span className="hidden text-[9px] text-[#687681] sm:inline">Alex · Owner</span></div>
              <div className="mt-2 flex items-center gap-2 px-1"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e8e4ef] text-[8px] font-semibold text-[#605b73]">M</span><span className="hidden text-[9px] text-[#687681] sm:inline">Morgan · Editor</span></div>
            </div>
          </aside>
          <div className="min-w-0 px-4 py-5 sm:px-8 sm:py-7">
            <div className="flex items-center justify-between gap-2 border-b border-[#eceeed] pb-4">
              <div className="min-w-0"><p className="text-[9px] font-medium text-[#7b8790]">Product studio <span className="px-1 text-[#c0c5c7]">/</span> Documents</p><h2 className="mt-2 truncate text-lg font-semibold tracking-[-.035em] text-[#263548] sm:text-2xl">Product direction</h2></div>
              <span aria-hidden="true" className="landing-members-pill hidden rounded-md border bg-white px-2.5 py-1.5 text-[9px] font-medium sm:block">Members</span>
            </div>
            <div className="mx-auto max-w-[390px] py-5 sm:py-7">
              <p className="text-[8px] font-semibold uppercase tracking-[.16em] text-[#8c969e] sm:text-[9px]">Project brief · Saved draft</p>
              <h3 className="mt-3 text-xl font-semibold leading-tight tracking-[-.04em] text-[#29384a] sm:text-[27px]">A clearer way to move work forward</h3>
              <p className="mt-3 text-[10px] leading-5 text-[#6d7881] sm:text-[12px] sm:leading-6">Keep the decisions, useful context, and next steps close to the work. A shared space gives everyone a clear place to pick things up.</p>
              <h4 className="mt-5 text-[12px] font-semibold text-[#344454] sm:text-sm">What we want to make easier</h4>
              <div className="mt-2 space-y-2 text-[10px] leading-5 text-[#6d7881] sm:text-[11px]">
                <p className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#758e9d]" /> Find the latest version without searching through messages.</p>
                <p className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#758e9d]" /> Leave feedback alongside the document it belongs to.</p>
              </div>
              <div className="mt-5 flex items-center gap-2 border-t border-[#eceeed] pt-3 text-[9px] text-[#849098]"><MessageSquare size={12} /><span>Comments stay with the document</span><span className="ml-auto inline-flex items-center gap-1"><Check size={11} /> Changes saved</span></div>
            </div>
          </div>
        </div>
      </div>
      <div className="landing-preview-note absolute -bottom-5 left-4 flex items-center gap-2.5 rounded-xl border border-[#e2e6e7] bg-white/95 px-3.5 py-2.5 shadow-[0_14px_32px_-22px_rgba(24,36,56,.42)] sm:left-auto sm:right-5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#edf2f2] text-[#58716e]"><Check size={14} /></span>
          <span><span className="block text-[10px] font-semibold text-[#344454]">One shared place</span><span className="mt-0.5 block text-[9px] text-[#859098]">Documents, comments, and shared access</span></span>
      </div>
    </div>
  );
}

function FeatureIllustration({
  kind,
}: {
  kind: "workspace" | "writing" | "feedback" | "search";
}) {
  if (kind === "workspace") {
    return (
      <div aria-hidden="true" className="landing-feature-art landing-art-workspace">
        <div className="landing-art-row"><span className="landing-art-dot" /> Product studio</div>
        <div className="landing-art-pills"><span>Owner</span><span>Editor</span><span>Viewer</span></div>
      </div>
    );
  }

  if (kind === "writing") {
    return (
      <div aria-hidden="true" className="landing-feature-art landing-art-writing">
        <span className="landing-art-title">Project direction</span>
        <span className="landing-art-line landing-art-line-strong" />
        <span className="landing-art-line" />
        <span className="landing-art-line landing-art-line-short" />
      </div>
    );
  }

  if (kind === "feedback") {
    return (
      <div aria-hidden="true" className="landing-feature-art landing-art-feedback">
        <span className="landing-art-avatar">M</span>
        <span className="landing-art-comment"><span>A note on the draft</span><i /><i /></span>
      </div>
    );
  }

  return (
    <div aria-hidden="true" className="landing-feature-art landing-art-search">
      <span className="landing-art-searchbox"><Search size={11} /> Search documents</span>
      <span className="landing-art-result"><FileText size={11} /> Launch notes</span>
    </div>
  );
}

const features = [
  { icon: Users, number: "01", kind: "workspace" as const, accent: "landing-feature-icon-workspace", title: "A home for each project", text: "Bring documents and the people around them into a shared workspace with clear membership." },
  { icon: FileText, number: "02", kind: "writing" as const, accent: "landing-feature-icon-writing", title: "Writing that stays focused", text: "Create rich documents, keep them organized, and return to the latest saved version." },
  { icon: MessageSquare, number: "03", kind: "feedback" as const, accent: "landing-feature-icon-feedback", title: "Feedback in context", text: "Keep comments close to the document so decisions have the context they need." },
  { icon: Search, number: "04", kind: "search" as const, accent: "landing-feature-icon-search", title: "Find the work again", text: "Search document titles and workspaces you are authorized to access." },
];

export function PublicLanding({ onSignIn, onGetStarted, error }: { onSignIn: () => void; onGetStarted: () => void; error?: string }) {
  return (
    <main id="top" className="landing-page min-h-screen overflow-hidden text-[#263548]">
      <header className="landing-nav sticky top-0 z-20 border-b border-[#dce2e2]/70">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 sm:px-8 lg:px-12">
          <a href="#top" aria-label="Collabry home" className="flex items-center rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#637d8d]"><CollabryBrand size="small" className="landing-brand-nav" /></a>
          <nav aria-label="Public navigation" className="hidden items-center gap-7 md:flex"><a href="#features" className="landing-link">Product</a><a href="#how-it-works" className="landing-link">How it works</a><a href="#faq" className="landing-link">FAQ</a></nav>
          <div className="flex items-center gap-2"><button type="button" onClick={onSignIn} className="landing-signin">Sign in</button><button type="button" onClick={onGetStarted} className="landing-button landing-button-small">Get started <ArrowUpRight size={14} /></button></div>
        </div>
        <nav aria-label="Public navigation on mobile" className="landing-mobile-nav mx-auto flex max-w-7xl items-center justify-center gap-7 border-t border-[#dce2e2]/70 px-5 py-2.5 md:hidden">
          <a href="#features" className="landing-link">Product</a><a href="#how-it-works" className="landing-link">How it works</a><a href="#faq" className="landing-link">FAQ</a>
        </nav>
      </header>
      {error && <div className="mx-auto max-w-7xl px-5 pt-4 sm:px-8 lg:px-12"><p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p></div>}

      <section className="landing-hero relative isolate mx-auto grid max-w-7xl items-center gap-14 px-5 pb-24 pt-14 sm:px-8 sm:pb-28 sm:pt-20 lg:grid-cols-[.9fr_1.1fr] lg:gap-12 lg:px-12 lg:pb-32 lg:pt-24">
        <HeroImageWall />
        <div className="landing-hero-copy landing-rise relative z-[1] max-w-xl">
          <div className="landing-eyebrow"><span className="h-1.5 w-1.5 rounded-full bg-[#7e9994]" /> A thoughtful workspace for teams</div>
          <h1 className="mt-7 text-[clamp(3.15rem,7vw,6rem)] font-medium leading-[.98] tracking-[-.075em] text-[#202e41]">Good work needs <span className="landing-gradient-text">room to grow.</span></h1>
          <p className="mt-6 max-w-lg text-[15px] leading-7 text-[#66737d] sm:text-[17px] sm:leading-8">Bring project documents, useful feedback, and the people doing the work into one calm, shared space.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row"><button type="button" onClick={onGetStarted} className="landing-button">Create your workspace <ArrowRight size={15} /></button><a href="#features" className="landing-button-secondary">Explore the workspace <ArrowDown size={14} /></a></div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[11px] font-medium text-[#77838b]"><span className="inline-flex items-center gap-2"><Check size={13} className="text-[#6f8e88]" /> Shared project spaces</span><span className="inline-flex items-center gap-2"><Check size={13} className="text-[#6f8e88]" /> Access by role</span></div>
        </div>
        <ProductPreview />
      </section>

      <section id="features" className="landing-section border-y border-[#dfe4e3]">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24 lg:px-12 lg:py-28">
          <div className="grid gap-8 lg:grid-cols-[.75fr_1.25fr] lg:items-end"><div><p className="landing-kicker">The essentials, together</p><h2 className="mt-4 max-w-xl text-3xl font-medium leading-tight tracking-[-.055em] text-[#263548] sm:text-[42px]">Less scattered work. More shared understanding.</h2></div><p className="max-w-lg text-sm leading-6 text-[#697780] lg:justify-self-end">Collabry gives your project a clear home—from the first working note to the final decision.</p></div>
          <div className="landing-feature-grid mt-12 grid overflow-hidden rounded-2xl border border-[#dce2e1] bg-[#dce2e1] sm:grid-cols-2 lg:mt-16 lg:grid-cols-4">
            {features.map(({ icon: Icon, number, kind, accent, title, text }) => <article key={number} className="landing-feature relative bg-[#f8f8f5] p-6 sm:p-7"><div className="flex items-center justify-between"><span className={`flex h-9 w-9 items-center justify-center rounded-lg border border-[#dfe5e4] ${accent}`}><Icon size={17} strokeWidth={1.7} /></span><span className="text-[10px] font-medium tracking-[.14em] text-[#697982]">{number}</span></div><FeatureIllustration kind={kind} /><h3 className="mt-5 text-[15px] font-semibold tracking-[-.02em] text-[#344454]">{title}</h3><p className="mt-2 text-[13px] leading-6 text-[#596b75]">{text}</p></article>)}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[.8fr_1.2fr] lg:items-center lg:px-12 lg:py-28">
        <div><p className="landing-kicker">A simple rhythm</p><h2 className="mt-4 max-w-md text-3xl font-medium leading-tight tracking-[-.055em] text-[#263548] sm:text-[42px]">Start with a space. Keep the thread.</h2><p className="mt-4 max-w-md text-sm leading-6 text-[#697780]">A clear path from bringing people together to finding the work again.</p><button type="button" onClick={onGetStarted} className="landing-text-link mt-6">Make a space of your own <ArrowRight size={14} /></button></div>
        <div className="relative grid gap-3 sm:grid-cols-3"><div className="landing-step-line" />{[{ n: "01", icon: Users, title: "Make a space", text: "Give the project and its documents a shared home." }, { n: "02", icon: ShieldCheck, title: "Set access", text: "Invite people with the role that fits their work." }, { n: "03", icon: Search, title: "Pick it back up", text: "Find recent documents, feedback, and decisions." }].map(({ n, icon: Icon, title, text }) => <article key={n} className="landing-step relative rounded-xl border border-[#dfe4e3] bg-[#f8f8f5] p-5 sm:p-5"><span className="relative z-[1] flex h-10 w-10 items-center justify-center rounded-lg border border-[#dce3e1] bg-[#f8f8f5] text-[#59747f]"><Icon size={17} strokeWidth={1.7} /></span><p className="mt-6 text-[9px] font-semibold tracking-[.16em] text-[#8a989c]">STEP {n}</p><h3 className="mt-2 text-sm font-semibold text-[#344454]">{title}</h3><p className="mt-2 text-xs leading-5 text-[#748087]">{text}</p></article>)}</div>
      </section>

      <section className="landing-context border-y border-[#dfe4e3]">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-2 lg:items-center lg:px-12 lg:py-28">
          <div className="relative min-h-[260px] overflow-hidden rounded-2xl border border-[#dce2e1] bg-[#e9edeb] p-6 sm:min-h-[310px] sm:p-8"><div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[#d7dfdd]/80 blur-3xl" /><div className="relative mx-auto max-w-sm rounded-xl border border-white/90 bg-[#fbfbf8] p-5 shadow-[0_22px_55px_-40px_rgba(28,43,59,.55)] sm:p-6"><div className="flex items-center justify-between border-b border-[#e7e9e6] pb-3"><span className="text-[10px] font-medium text-[#71808a]">Workspace note</span><span className="rounded-full bg-[#e9efec] px-2 py-1 text-[9px] text-[#617a73]">Editor</span></div><div className="mt-5 h-2 w-2/3 rounded bg-[#d9dfe0]" /><div className="mt-3 h-2 w-full rounded bg-[#e6e9e8]" /><div className="mt-2 h-2 w-5/6 rounded bg-[#e6e9e8]" /><div className="mt-5 rounded-lg border border-[#e1e6e4] bg-white p-3"><div className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e5e8ed] text-[8px] font-semibold text-[#586779]">M</span><span className="text-[9px] font-semibold text-[#51616c]">A note on the draft</span></div><div className="ml-8 mt-2 h-1.5 w-4/5 rounded bg-[#e9ecea]" /></div><div className="mt-5 flex items-center gap-2 text-[9px] text-[#5f7078]"><MessageSquare size={12} /> Comments stay with the document</div></div><p className="absolute bottom-5 left-6 text-[9px] font-medium uppercase tracking-[.14em] text-[#596b75] sm:bottom-7 sm:left-8">Documents with their context</p></div>
          <div className="lg:pl-8"><p className="landing-kicker">Made for the in-between</p><h2 className="mt-4 max-w-lg text-3xl font-medium leading-tight tracking-[-.055em] text-[#263548] sm:text-[42px]">The work around the work belongs somewhere.</h2><p className="mt-5 max-w-lg text-sm leading-6 text-[#697780]">Project briefs, meeting notes, team guidelines, and early drafts all need a place where the right people can find them.</p><div className="mt-7 flex flex-wrap gap-2">{["Project planning", "Team documentation", "Shared notes", "Working drafts"].map((item) => <span key={item} className="rounded-full border border-[#dce2e1] bg-[#f8f8f5] px-3 py-1.5 text-[11px] font-medium text-[#61717c]">{item}</span>)}</div></div>
        </div>
      </section>

      <section className="landing-access-section mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24 lg:px-12 lg:py-28"><div className="grid gap-10 lg:grid-cols-[.75fr_1.25fr] lg:items-start"><div><p className="landing-kicker">Clear by default</p><h2 className="mt-4 max-w-sm text-3xl font-medium leading-tight tracking-[-.055em] text-[#263548] sm:text-[40px]">The right people. The right level of access.</h2></div><div className="landing-access-list divide-y divide-[#dfe4e3] border-y border-[#dfe4e3]">{[{ role: "Owner", description: "Manage the workspace and edit its documents." }, { role: "Editor", description: "Edit and save shared documents." }, { role: "Commenter", description: "Read documents and leave comments." }, { role: "Viewer", description: "Read documents in the workspace." }].map(({ role, description }, index) => <div key={role} className="landing-access-row grid grid-cols-[28px_100px_1fr] items-center gap-3 py-4 sm:grid-cols-[36px_130px_1fr]"><span className="text-[10px] font-medium tracking-[.12em] text-[#596b75]">0{index + 1}</span><span className="text-sm font-semibold text-[#40515f]">{role}</span><span className="text-xs leading-5 text-[#596b75] sm:text-sm">{description}</span></div>)}</div></div></section>

      <section id="faq" className="landing-section border-y border-[#dfe4e3]"><div className="mx-auto grid max-w-7xl gap-10 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[.75fr_1.25fr] lg:px-12 lg:py-28"><div><p className="landing-kicker">A few details</p><h2 className="mt-4 text-3xl font-medium tracking-[-.055em] text-[#263548] sm:text-[40px]">Questions, answered.</h2></div><div className="divide-y divide-[#dfe4e3] border-y border-[#dfe4e3]">{[{ q: "What is Collabry?", a: "Collabry is a shared workspace for project documents, comments, and the people who work on them." }, { q: "How do I share a document?", a: "Workspace owners can add existing Collabry accounts and choose an access role. Members can access documents in that workspace according to their permissions." }, { q: "Can everyone edit documents?", a: "Owners and Editors can edit. Commenters can read and leave feedback, while Viewers have read access." }, { q: "How do I find my documents again?", a: "Use dashboard search to find workspaces and document titles you are authorized to access." }].map(({ q, a }) => <details key={q} className="landing-faq group py-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-[#40515f] marker:hidden">{q}<ChevronDown size={15} className="shrink-0 text-[#5f7078] transition-transform group-open:rotate-180" /></summary><p className="max-w-2xl pt-3 pr-8 text-sm leading-6 text-[#596b75]">{a}</p></details>)}</div></div></section>

      <section className="px-5 py-16 sm:px-8 sm:py-20 lg:px-12"><div className="landing-cta relative mx-auto max-w-7xl overflow-hidden rounded-2xl px-6 py-12 text-center text-white sm:px-12 sm:py-16"><div className="landing-cta-glow absolute inset-0" /><div className="relative mx-auto max-w-2xl"><CollabryBrand inverse size="medium" className="mx-auto" /><h2 className="mt-5 text-3xl font-medium tracking-[-.05em] sm:text-[42px]">Make room for good work.</h2><p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-[#d0d9df]">Bring your project, its documents, and the people behind it into focus.</p><button type="button" onClick={onGetStarted} className="landing-button-light mt-7">Get started with Collabry <ArrowRight size={15} /></button></div></div></section>

      <footer className="border-t border-[#dce2e1] bg-[#f1f2ef] px-5 py-7 sm:px-8 lg:px-12"><div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><a href="#top" aria-label="Collabry home" className="flex items-center"><CollabryBrand size="small" /></a><p className="text-xs text-[#7a858a]">A thoughtful home for your team&apos;s work.</p><button type="button" onClick={onSignIn} className="landing-footer-link">Sign in to your workspace <ArrowRight size={13} /></button></div></footer>
    </main>
  );
}
