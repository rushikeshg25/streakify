import { createApi } from '../server/api.js';

// Static pages use Vercel's CDN; only /api/* invokes this function.
export default createApi({ hosted: true });
