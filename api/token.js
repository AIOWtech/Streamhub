import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authorization = req.headers.authorization || '';
  const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!accessToken) return res.status(401).json({ error: 'Sign in to StreamHub before joining a live room.' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const serverUrl = process.env.LIVEKIT_URL;

  if (!supabaseUrl || !supabaseKey) return res.status(503).json({ error: 'Supabase server configuration is missing.' });
  if (!apiKey || !apiSecret || !serverUrl) return res.status(503).json({ error: 'LiveKit is not configured. Check LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET in Vercel.' });

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) return res.status(401).json({ error: 'Your session is invalid or expired. Please sign in again.' });

    const { roomName, participantName, role } = req.body || {};
    const safeRoom = String(roomName || '').trim();
    const safeName = String(participantName || '').trim().slice(0, 64);
    if (!/^[a-zA-Z0-9_-]{3,100}$/.test(safeRoom)) return res.status(400).json({ error: 'Room name must be 3–100 characters and contain only letters, numbers, hyphens or underscores.' });
    if (!safeName) return res.status(400).json({ error: 'A display name is required.' });
    if (role !== 'host' && role !== 'viewer') return res.status(400).json({ error: 'Role must be host or viewer.' });

    const scopedSupabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: stream, error: streamError } = await scopedSupabase
      .from('streams').select('id,owner_id,status').eq('room_name', safeRoom).maybeSingle();
    if (streamError) return res.status(403).json({ error: 'Unable to verify this stream room.' });
    if (!stream) return res.status(404).json({ error: 'This room has no published StreamHub listing.' });
    if (role === 'host' && (stream.owner_id !== user.id || !['scheduled', 'live'].includes(stream.status))) {
      return res.status(403).json({ error: 'Only the channel owner can broadcast in this room.' });
    }
    if (role === 'viewer' && stream.status !== 'live') {
      return res.status(403).json({ error: 'This broadcast is not live yet.' });
    }

    const token = new AccessToken(apiKey, apiSecret, {
      identity: user.id,
      name: safeName,
      ttl: '2h'
    });
    token.addGrant({
      roomJoin: true,
      room: safeRoom,
      canPublish: role === 'host',
      canSubscribe: true,
      canPublishData: role === 'host'
    });

    return res.status(200).json({ token: await token.toJwt(), serverUrl });
  } catch (error) {
    console.error('LiveKit token generation failed:', error);
    return res.status(500).json({ error: 'Could not create a streaming session.' });
  }
}