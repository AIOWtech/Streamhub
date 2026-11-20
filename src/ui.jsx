import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import { Search, Radio, Compass, Tv, Menu, X, Play, Users, ExternalLink, LogOut, RefreshCw } from 'lucide-react';

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

export default function App() {
  const [streams, setStreams] = useState([]);
  const [following, setFollowing] = useState([]);
  const [followLoading, setFollowLoading] = useState(false);
  const [hostStreamId, setHostStreamId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState('discover');
  const [selected, setSelected] = useState(null);
  const [roomSession, setRoomSession] = useState(null);
  const [roomName, setRoomName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [roomRole, setRoomRole] = useState('viewer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showRoom, setShowRoom] = useState(false);
  const [showExternal, setShowExternal] = useState(false);
  const [externalUrl, setExternalUrl] = useState('');
  const [externalEmbed, setExternalEmbed] = useState('');
  const [mobileNav, setMobileNav] = useState(false);

  const loadStreams = async () => {
    setLoading(true);
    setLoadError('');
    const { data, error: err } = await supabase
      .from('streams')
      .select('id,title,description,room_name,status,created_at,channels(title,slug)')
      .eq('status', 'live')
      .order('created_at', { ascending: false })
      .limit(60);
    if (err) setLoadError(err.message);
    else setStreams(data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadStreams();
    const channel = supabase.channel('streamhub-live-streams')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'streams' }, loadStreams)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadFollowing = async () => {
    setFollowLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setFollowing([]); setFollowLoading(false); return; }
    const { data, error: err } = await supabase.from('follows')
      .select('channel_id,channels(id,title,slug,description)')
      .eq('follower_id', session.user.id);
    if (err) setLoadError(err.message);
    else setFollowing((data || []).map(row => row.channels).filter(Boolean));
    setFollowLoading(false);
  };

  useEffect(() => {
    loadFollowing();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => loadFollowing());
    return () => subscription.unsubscribe();
  }, []);

  const followedStreams = useMemo(() => streams.filter(stream =>
    following.some(channel => channel.id === stream.channel_id)
  ), [streams, following]);

  const filtered = useMemo(() => streams.filter(stream => {
    const channel = stream.channels?.title || '';
    return [stream.title, stream.description, channel].join(' ').toLowerCase().includes(query.toLowerCase());
  }), [streams, query]);

  const connectRoom = async (role, targetRoom) => {
    setBusy(true);
    setError('');
    let createdStreamId = null;
    try {
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      if (authError) throw authError;
      if (!session?.access_token) throw new Error('Sign in first using the Account button to join or host a room.');
      if (role === 'host') {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: creatorChannel, error: channelError } = await supabase.from('channels')
          .select('id').eq('owner_id', user.id).maybeSingle();
        if (channelError) throw channelError;
        if (!creatorChannel) throw new Error('Create your creator channel first using Account, then start your broadcast.');
        const { data: stream, error: streamError } = await supabase.from('streams').insert({
          channel_id: creatorChannel.id, owner_id: user.id, title: broadcastTitle.trim() || targetRoom, description: '',
          room_name: targetRoom, status: 'scheduled'
        }).select('id').single();
        if (streamError) throw streamError;
        createdStreamId = stream.id;
      }
      const response = await fetch('/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ roomName: targetRoom, participantName: displayName.trim(), role })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not connect to the room.');
      setHostStreamId(createdStreamId);
      setRoomSession({ token: result.token, serverUrl: result.serverUrl, role });
      setRoomName(targetRoom);
      setPage('room');
      setSelected(null);
      setShowRoom(false);
    } catch (err) {
      if (role === 'host' && createdStreamId) await supabase.from('streams').update({ status: 'ended' }).eq('id', createdStreamId);
      setError(err.message || 'Unable to connect.');
    } finally {
      setBusy(false);
    }
  };

  const openLiveStream = stream => {
    setSelected(stream);
    setPage('watch');
    setMobileNav(false);
  };

  const parseExternalUrl = value => {
    try {
      const url = new URL(value);
      if (url.hostname === 'youtu.be') return 'https://www.youtube-nocookie.com/embed/' + url.pathname.slice(1);
      if (url.hostname.endsWith('youtube.com')) {
        const id = url.searchParams.get('v') || url.pathname.split('/').filter(Boolean).pop();
        if (id && id !== 'live') return 'https://www.youtube-nocookie.com/embed/' + id;
        const liveId = url.pathname.match(/live\/([^/?]+)/)?.[1];
        if (liveId) return 'https://www.youtube-nocookie.com/embed/' + liveId;
      }
      if (url.hostname.endsWith('twitch.tv')) {
        const channel = url.pathname.split('/').filter(Boolean)[0];
        if (channel) return 'https://player.twitch.tv/?channel=' + encodeURIComponent(channel) + '&parent=' + window.location.hostname;
      }
    } catch {}
    return '';
  };

  const openExternal = () => {
    const embed = parseExternalUrl(externalUrl.trim());
    if (!embed) { setError('Enter a valid YouTube or Twitch URL.'); return; }
    setExternalEmbed(embed);
    setPage('external');
    setShowExternal(false);
    setError('');
  };

  const goHome = () => { setPage('discover'); setSelected(null); setRoomSession(null); };

  return <div className="app-shell">
    <header className="topbar">
      <button className="icon-button mobile-menu" aria-label="Open navigation" aria-expanded={mobileNav} onClick={() => setMobileNav(v => !v)}><Menu /></button>
      <button className="brand" onClick={goHome} aria-label="StreamHub home"><span className="brand-symbol"><Radio size={19}/></span><span>Stream<span>Hub</span></span></button>
      <label className="search-box"><Search size={18}/><input aria-label="Search live streams" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search live streams and channels"/></label>
      <div className="top-actions">
        <button className="secondary-button" onClick={() => setShowExternal(true)}><Tv size={16}/> Watch external</button>
        <button className="primary-button" onClick={() => {setRoomRole('host');setRoomName('');setError('');setShowRoom(true);}}><Radio size={16}/> Go live</button>
        <button className="account-button" onClick={() => document.querySelector('.shb-launch')?.click()}>Account</button>
      </div>
    </header>

    <div className="app-layout">
      <aside className={mobileNav ? 'sidebar sidebar-open' : 'sidebar'} aria-label="Main navigation">
        <button className={page === 'discover' ? 'side-link active' : 'side-link'} onClick={goHome}><Compass size={18}/> Discover</button>
        <button className={page === 'following' ? 'side-link active' : 'side-link'} onClick={() => {setPage('following');setMobileNav(false);}}><Users size={18}/> Following</button>
        <button className={page === 'external' ? 'side-link active' : 'side-link'} onClick={() => {setPage('external');setMobileNav(false);}}><Tv size={18}/> External player</button>
        <div className="sidebar-note"><strong>StreamHub</strong><p>Live broadcasts from channels on this platform appear here when their status is live.</p></div>
      </aside>

      <main className="main-content">
        {page === 'discover' && <>
          <section className="page-heading">
            <div><p className="eyebrow">DISCOVER</p><h1>Live now</h1><p className="intro">Find a broadcast or start your own room.</p></div>
            <button className="secondary-button refresh-button" onClick={loadStreams} disabled={loading}><RefreshCw size={16}/> Refresh</button>
          </section>
          {loading ? <div className="state-panel" role="status">Loading live broadcasts…</div>
            : loadError ? <div className="state-panel error-panel"><p>Live broadcasts could not be loaded.</p><small>{loadError}</small><button className="secondary-button" onClick={loadStreams}>Try again</button></div>
            : filtered.length === 0 ? <div className="empty-state"><div className="empty-icon"><Radio size={25}/></div><h2>{query ? 'No matching live streams' : 'No one is live right now'}</h2><p>{query ? 'Try a different search.' : 'When a creator starts a published stream, it will appear here. You can also start a room yourself.'}</p><button className="primary-button" onClick={() => {setRoomRole('host');setRoomName('');setError('');setShowRoom(true);}}><Radio size={16}/> Start a live room</button></div>
            : <div className="stream-grid">{filtered.map(stream => <article className="stream-card" key={stream.id}>
              <button className="stream-open" onClick={() => openLiveStream(stream)} aria-label={'Watch ' + stream.title}>
                <div className="stream-art"><span className="live-label"><i/> LIVE</span><Play size={34}/></div>
                <div className="stream-details"><h2>{stream.title}</h2><p>{stream.channels?.title || 'StreamHub channel'}</p>{stream.description && <small>{stream.description}</small>}</div>
              </button>
              <button className="watch-button" onClick={() => openLiveStream(stream)}>Watch live</button>
            </article>)}</div>}
        </>}

        {page === 'watch' && selected && <section className="watch-page">
          <button className="back-button" onClick={goHome}>← Back to live streams</button>
          <div className="watch-layout">
            <div className="watch-main"><div className="video-stage"><div><Radio size={38}/><p>Live room</p><button className="primary-button" onClick={() => connectRoom('viewer', selected.room_name)}>Join broadcast</button></div></div><h1>{selected.title}</h1><p className="channel-name">{selected.channels?.title || 'StreamHub channel'}</p>{selected.description && <p className="stream-description">{selected.description}</p>}</div>
            <aside className="watch-aside"><h2>Broadcast details</h2><p>This listing is marked live in StreamHub. Join the LiveKit room to watch and participate.</p><button className="primary-button full-width" onClick={() => connectRoom('viewer', selected.room_name)}><Play size={16}/> Join live room</button></aside>
          </div>
        </section>}

        {page === 'room' && <section className="room-page">
          <div className="page-heading"><div><p className="eyebrow">LIVE ROOM</p><h1>{roomName}</h1></div><button className="secondary-button" onClick={() => {setRoomSession(null);goHome();}}>Leave room</button></div>
          {roomSession ? <div className="livekit-container"><LiveKitRoom token={roomSession.token} serverUrl={roomSession.serverUrl} connect={true} video={roomSession.role === 'host'} audio={roomSession.role === 'host'} onConnected={async () => { if (roomSession.role === 'host' && hostStreamId) { const { error: publishError } = await supabase.from('streams').update({ status: 'live' }).eq('id', hostStreamId); if (publishError) setError('Connected to LiveKit, but the stream could not be published: ' + publishError.message); } }} onDisconnected={async () => { if (roomSession.role === 'host' && hostStreamId) await supabase.from('streams').update({ status: 'ended' }).eq('id', hostStreamId); setHostStreamId(null); setRoomSession(null); goHome(); }}><VideoConference/></LiveKitRoom></div> : <div className="state-panel">You have left this room.</div>}
        </section>}

        {page === 'external' && <section className="external-page"><p className="eyebrow">EXTERNAL PLAYER</p><h1>Watch from another platform</h1><p className="intro">Open an embeddable YouTube or Twitch broadcast.</p>{externalEmbed ? <div className="embed-container"><iframe src={externalEmbed} title="External video player" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen/></div> : <div className="empty-state"><div className="empty-icon"><Tv size={25}/></div><h2>No external stream selected</h2><p>Paste a public YouTube or Twitch URL to open its player here.</p><button className="primary-button" onClick={() => setShowExternal(true)}>Add stream URL</button></div>}</section>}

        {page === 'following' && <section><div className="page-heading"><div><p className="eyebrow">YOUR FEED</p><h1>Following</h1><p className="intro">Live broadcasts from channels you follow.</p></div><button className="secondary-button" onClick={loadFollowing} disabled={followLoading}><RefreshCw size={16}/> Refresh</button></div>{followLoading ? <div className="state-panel" role="status">Loading followed channels…</div> : following.length === 0 ? <div className="empty-state"><div className="empty-icon"><Users size={25}/></div><h2>No followed channels yet</h2><p>Sign in and follow a creator from the Account panel. Their live broadcasts will appear here.</p><button className="secondary-button" onClick={() => document.querySelector('.shb-launch')?.click()}>Open account</button></div> : followedStreams.length === 0 ? <div className="empty-state"><div className="empty-icon"><Radio size={25}/></div><h2>Your channels are offline</h2><p>You follow {following.length} channel{following.length === 1 ? '' : 's'}. Their broadcasts will appear here when they go live.</p></div> : <div className="stream-grid">{followedStreams.map(stream => <article className="stream-card" key={stream.id}><button className="stream-open" onClick={() => openLiveStream(stream)}><div className="stream-art"><span className="live-label"><i/> LIVE</span><Play size={34}/></div><div className="stream-details"><h2>{stream.title}</h2><p>{stream.channels?.title || 'StreamHub channel'}</p>{stream.description && <small>{stream.description}</small>}</div></button><button className="watch-button" onClick={() => openLiveStream(stream)}>Watch live</button></article>)}</div>}</section>}
      </main>
    </div>

    {showRoom && <div className="modal-backdrop" onMouseDown={e => {if(e.target === e.currentTarget)setShowRoom(false);}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="room-title"><button className="modal-close icon-button" aria-label="Close" onClick={() => setShowRoom(false)}><X/></button><p className="eyebrow">LIVEKIT ROOM</p><h2 id="room-title">Start or join a room</h2><p>Use a room name shared by the host. Hosting requires a signed-in account.</p><label htmlFor="broadcast-title">Broadcast title</label><input id="broadcast-title" value={broadcastTitle} onChange={e => setBroadcastTitle(e.target.value)} placeholder="What are you streaming?"/><label htmlFor="display-name">Display name</label><input id="display-name" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name" autoComplete="name"/><label htmlFor="room-name">Room name</label><input id="room-name" value={roomName} onChange={e => setRoomName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,'-'))} placeholder="my-live-room"/><div className="role-switch"><button className={roomRole === 'host' ? 'selected' : ''} onClick={() => setRoomRole('host')}>Broadcast</button><button className={roomRole === 'viewer' ? 'selected' : ''} onClick={() => setRoomRole('viewer')}>Join as viewer</button></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button full-width" disabled={busy || !roomName.trim() || !displayName.trim() || (roomRole === 'host' && !broadcastTitle.trim())} onClick={() => connectRoom(roomRole, roomName.trim())}>{busy ? 'Connecting…' : roomRole === 'host' ? 'Start broadcasting' : 'Join room'}</button></section></div>}

    {showExternal && <div className="modal-backdrop" onMouseDown={e => {if(e.target === e.currentTarget)setShowExternal(false);}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="external-title"><button className="modal-close icon-button" aria-label="Close" onClick={() => setShowExternal(false)}><X/></button><p className="eyebrow">EXTERNAL PLAYER</p><h2 id="external-title">Add a stream URL</h2><p>Paste a YouTube video/live URL or Twitch channel URL.</p><label htmlFor="external-url">Stream URL</label><input id="external-url" type="url" value={externalUrl} onChange={e => setExternalUrl(e.target.value)} placeholder="https://…"/>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button full-width" onClick={openExternal}><ExternalLink size={16}/> Open player</button></section></div>}
  </div>;
}
