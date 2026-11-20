import { AccessToken } from 'livekit-server-sdk';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { roomName, participantName, role } = req.body || {};
  if (!roomName || !participantName) return res.status(400).json({ error: 'roomName and participantName are required' });
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const serverUrl = process.env.LIVEKIT_URL;
  if (!apiKey || !apiSecret || !serverUrl) return res.status(503).json({ error: 'Live broadcasting is not configured yet. Add LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET in Vercel project settings.' });

  try {
    const token = new AccessToken(apiKey, apiSecret, { identity: participantName.slice(0, 64), ttl: '2h' });
    token.addGrant({ roomJoin: true, room: String(roomName).slice(0, 100), canPublish: role === 'host', canSubscribe: true, canPublishData: true });
    return res.status(200).json({ token: await token.toJwt(), serverUrl });
  } catch (error) {
    return res.status(500).json({ error: 'Could not create a streaming session.' });
  }
}