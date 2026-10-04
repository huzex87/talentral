// GET /api/v1/public/keys: the Ed25519 public keys that sign credential answers (JWK set).
import { API_HEADERS, publicKeys } from '@/lib/credentials';

export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ keys: publicKeys() }, { headers: { ...API_HEADERS, 'Cache-Control': 'public, max-age=3600' } });
}
