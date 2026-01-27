# Intensive Gainz Unit (IGU)

Evidence-based online coaching platform with team programs and performance tracking for serious lifters.

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite
- **UI**: shadcn-ui + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Edge Functions)
- **State**: TanStack Query (React Query)
- **Forms**: React Hook Form + Zod

## Getting Started

### Prerequisites

- Node.js 18+ (recommended: use [nvm](https://github.com/nvm-sh/nvm))
- npm or yarn
- A Supabase project

### 1. Clone the Repository

```bash
git clone https://github.com/DrIron/IGU-The-Intensive-Gainz-Unit.git
cd IGU-The-Intensive-Gainz-Unit
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy the example environment file and fill in your values:

```bash
cp .env.example .env.local
```

Then edit `.env.local` with your Supabase credentials:

```env
VITE_SUPABASE_PROJECT_ID="your-project-ref"
VITE_SUPABASE_PUBLISHABLE_KEY="your-anon-key"
VITE_SUPABASE_URL="https://your-project-ref.supabase.co"
```

**Where to find these values:**
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **Settings** → **API**
4. Copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_PUBLISHABLE_KEY`
   - **Reference ID** (from URL or Settings → General) → `VITE_SUPABASE_PROJECT_ID`

### 4. Start Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:8080`

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | ✅ | Your Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ | Your Supabase anon/public key |
| `VITE_SUPABASE_PROJECT_ID` | ✅ | Your Supabase project reference ID |

> **Note**: All frontend env vars must be prefixed with `VITE_` for Vite to expose them.

## Project Structure

```
├── src/
│   ├── components/       # React components
│   │   ├── admin/       # Admin dashboard components
│   │   ├── client/      # Client-facing components
│   │   ├── coach/       # Coach dashboard components
│   │   └── ui/          # shadcn-ui base components
│   ├── pages/           # Route pages
│   ├── hooks/           # Custom React hooks
│   ├── lib/             # Utilities and configs
│   └── integrations/    # External service integrations
├── supabase/
│   ├── functions/       # Edge Functions (Deno)
│   ├── migrations/      # Database migrations
│   └── config.toml      # Supabase CLI config
└── public/              # Static assets
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

## Supabase CLI Setup (Optional)

For database migrations and edge functions:

```bash
# Install Supabase CLI
brew install supabase/tap/supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Pull current schema
supabase db pull

# Deploy edge functions
supabase functions deploy
```

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project in [Vercel](https://vercel.com)
3. Add environment variables in Vercel dashboard
4. Deploy

### Other Platforms

Any static hosting that supports SPA routing:
- Netlify
- Cloudflare Pages
- AWS S3 + CloudFront

## Security Notes

- `.env.local` is gitignored - never commit secrets
- Only the anon/public key is used in frontend (safe to expose)
- Service role keys are only used in Supabase Edge Functions
- Row Level Security (RLS) enforces data access at database level

## License

Private - All rights reserved.
