# 3B Fleet Commander

Mileage Intelligence System — load tracking, detention, settlement audit, profitability grading.

## Deploy to Vercel (5 min)
1. Push repo to GitHub  
2. Import at vercel.com/new — auto-detects Next.js  
3. Add env vars in Vercel → Settings → Environment Variables  
4. Add domain `fleet.bouncebackbrian.com` in Vercel → Settings → Domains  

## Connect Supabase
1. Create project at supabase.com  
2. Copy `.env.example` → `.env.local` and fill in URL + anon key  
3. Run the SQL schema shown in the Settings page inside the app  

## Local dev
```bash
npm install
npm run dev
```
