'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Gauge, BarChart2, Truck, FileCheck, Clock, Fuel, Settings, ChevronLeft, ChevronRight, MapPin, MessageSquare, LogOut, Receipt, HardHat, MapPinned, Timer } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { createAuthClient } from '@/lib/auth-client'
import { getCurrentUser, type OpsProfile } from '@/lib/auth-adapter'
import { isHrefVisibleForOpsProfile } from '@/lib/userMode'

const MODULES = [
  {
    group: 'Command',
    items: [
      {href:'/dashboard', label:'Dashboard',        icon:Gauge},
    ]
  },
  {
    group: 'Mileage Intelligence',
    items: [
      {href:'/mis',       label:'MIS Overview',     icon:BarChart2},
      {href:'/loads',     label:'Load Log',         icon:Truck},
      {href:'/audit',     label:'Settlement Audit', icon:FileCheck},
    ]
  },
  {
    group: 'Operations',
    items: [
      {href:'/trips',    label:'Trip Planner',      icon:MapPin},
      {href:'/dispatch', label:'Dispatch Messages', icon:MessageSquare},
      {href:'/expenses', label:'Expense Tracker',   icon:Receipt},
      {href:'/delays',   label:'Delay & Detention', icon:Clock},
      {href:'/fuel',     label:'Fuel Log',          icon:Fuel},
    ]
  },
  {
    group: 'Dump Truck Mode',
    items: [
      {href:'/driver/dump-truck', label:'Driver Cockpit', icon:HardHat},
      {href:'/driver/hours',      label:'My Hours',       icon:Timer},
      {href:'/admin/dump-truck',  label:'Sites & Jobs',   icon:MapPinned},
    ]
  },
  {
    group: 'System',
    items: [
      {href:'/settings', label:'Settings', icon:Settings},
    ]
  }
]

type Profile = {
  email: string | null
  full_name: string | null
  role: string | null
  three_b_id: string | null
  three_b_biz_id: string | null
  three_b_linked: boolean
}

export default function Sidebar() {
  const [col,     setCol]     = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [opsProfile, setOpsProfile] = useState<OpsProfile | null>(null)
  const path    = usePathname()
  const router  = useRouter()
  const fleetDb = createClient()

  useEffect(() => {
    createAuthClient().auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      try {
        const { data: prof } = await fleetDb
          .from('profiles')
          .select('email,full_name,role,three_b_id,three_b_biz_id,three_b_linked')
          .eq('id', data.user.id)
          .single()
        setProfile(prof ?? { email: data.user.email ?? null, full_name: null, role: null, three_b_id: null, three_b_biz_id: null, three_b_linked: false })
      } catch {
        setProfile({ email: data.user.email ?? null, full_name: null, role: null, three_b_id: null, three_b_biz_id: null, three_b_linked: false })
      }
    })
    getCurrentUser().then(user => setOpsProfile(user?.opsProfile ?? null))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** Hides OTR-only or dump-truck-only groups/items for the business's ops profile
   *  (e.g. a dump-truck business never sees Mileage Intelligence / Trip Planner /
   *  Dispatch Messages — see userMode.ts's OPS_PROFILE_HIDDEN_HREFS). */
  const visibleModules = MODULES
    .map(({ group, items }) => ({ group, items: items.filter(i => isHrefVisibleForOpsProfile(i.href, opsProfile)) }))
    .filter(({ items }) => items.length > 0)

  const signOut = async () => {
    await createAuthClient().auth.signOut()
    router.replace('/login')
  }

  const displayName = profile?.full_name || profile?.email || ''
  const initial     = displayName[0]?.toUpperCase() ?? '?'
  return (
    <aside className="app-sidebar" style={{width:col?68:268,transition:'width 220ms cubic-bezier(0.16,1,0.3,1)',background:'linear-gradient(180deg,#081a16 0%,#050f0d 100%)',borderRight:'1px solid rgba(0,232,176,.13)',position:'sticky',top:0,height:'100dvh',display:'flex',flexDirection:'column',flexShrink:0,overflow:'hidden',zIndex:20}}>

      {/* Logo */}
      <div style={{padding:col?'.75rem .5rem':'.75rem 1rem',display:'flex',alignItems:'center',gap:10,borderBottom:'1px solid var(--border)',flexShrink:0,background:'rgba(0,230,118,.03)'}}>
        <img
          src="/logo.png"
          alt="3B Fleet Commander"
          style={{width:col?42:48,height:col?42:48,borderRadius:10,flexShrink:0,objectFit:'cover',boxShadow:'0 0 16px rgba(0,232,176,.4)'}}
        />
        {!col && (
          <div style={{overflow:'hidden',flex:1,minWidth:0}}>
            <div style={{fontWeight:900,fontSize:'.88rem',lineHeight:1.1,letterSpacing:'.01em',whiteSpace:'nowrap',color:'#f5c200',textShadow:'0 0 12px rgba(245,194,0,.4)'}}>
              3B FLEET COMMANDER
            </div>
            <div style={{fontSize:'.6rem',color:'var(--primary)',marginTop:3,fontWeight:700,whiteSpace:'nowrap',letterSpacing:'.12em',textTransform:'uppercase',textShadow:'0 0 8px rgba(0,230,118,.5)'}}>
              Mileage Intelligence
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{flex:1,padding:'.6rem .45rem',display:'flex',flexDirection:'column',gap:0,overflowY:'auto'}}>
        {visibleModules.map(({group, items}) => (
          <div key={group} style={{marginBottom:'.5rem'}}>
            {!col && (
              <div style={{fontSize:'var(--text-xs)',color:'var(--faint)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.1em',padding:'.5rem .85rem .3rem',userSelect:'none'}}>
                {group}
              </div>
            )}
            {col && <div style={{height:'.5rem'}}/>}
            {items.map(({href,label,icon:Icon}) => {
              const active = path === href || path.startsWith(href+'/')
              return (
                <Link key={href} href={href} title={col ? label : undefined}
                  style={{display:'flex',alignItems:'center',gap:10,padding:'.7rem .85rem',borderRadius:11,textDecoration:'none',whiteSpace:'nowrap',overflow:'hidden',
                    background: active ? 'rgba(0,232,176,.1)' : 'transparent',
                    color: active ? 'var(--primary)' : 'var(--muted)',
                    fontWeight: active ? 700 : 500,
                    fontSize:'var(--text-sm)',
                    boxShadow: active ? 'inset 0 0 0 1px rgba(0,232,176,.15)' : 'none',
                    transition:'all 180ms cubic-bezier(0.16,1,0.3,1)'}}>
                  <Icon size={16} style={{flexShrink:0}}/>
                  {!col && <span>{label}</span>}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Footer: user + MIS badge + collapse */}
      <div style={{padding:'.5rem .45rem .9rem',borderTop:'1px solid var(--border)',display:'flex',flexDirection:'column',gap:6}}>
        {/* Signed-in user + 3B ID */}
        {profile && !col && (
          <div style={{margin:'0 .45rem',borderRadius:12,background:'rgba(0,232,176,.04)',border:'1px solid rgba(0,232,176,.1)',overflow:'hidden'}}>
            {/* User row */}
            <div style={{padding:'.55rem .75rem',display:'flex',alignItems:'center',gap:7}}>
              <div style={{width:30,height:30,borderRadius:'50%',background:'linear-gradient(135deg,#00e8b0,#00c090)',display:'grid',placeItems:'center',flexShrink:0,fontSize:'.8rem',fontWeight:900,color:'#061210',boxShadow:'0 0 8px rgba(0,232,176,.3)'}}>
                {initial}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:'.7rem',color:'var(--text)',fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                  {profile.full_name || profile.email}
                </div>
                {profile.role && (
                  <div style={{fontSize:'.58rem',color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.07em',fontWeight:600}}>
                    {profile.role}
                  </div>
                )}
              </div>
              <button onClick={signOut} title="Sign out" style={{padding:'.3rem',borderRadius:6,color:'var(--muted)',flexShrink:0,display:'flex',alignItems:'center',background:'none',border:'none',cursor:'pointer'}}>
                <LogOut size={13}/>
              </button>
            </div>
            {/* 3B ID row */}
            {profile.three_b_id ? (
              <div style={{padding:'.35rem .75rem .5rem',borderTop:'1px solid rgba(0,232,176,.08)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <span style={{fontSize:'.58rem',color:'var(--muted)',fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase'}}>3B ID</span>
                <span style={{fontSize:'.68rem',color:'var(--primary)',fontWeight:800,letterSpacing:'.05em',fontVariantNumeric:'tabular-nums',textShadow:'0 0 8px rgba(0,232,176,.4)'}}>{profile.three_b_id}</span>
              </div>
            ) : (
              <div style={{padding:'.35rem .75rem .5rem',borderTop:'1px solid rgba(0,232,176,.08)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <span style={{fontSize:'.58rem',color:'var(--faint)',fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase'}}>3B ID</span>
                <span style={{fontSize:'.62rem',color:'rgba(245,194,0,.5)',fontWeight:700,letterSpacing:'.04em'}}>Not linked</span>
              </div>
            )}
            {/* 3B Biz ID row */}
            {profile.three_b_biz_id && (
              <div style={{padding:'.35rem .75rem .5rem',borderTop:'1px solid rgba(0,232,176,.08)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <span style={{fontSize:'.58rem',color:'var(--muted)',fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase'}}>Biz ID</span>
                <span style={{fontSize:'.68rem',color:'#f5c200',fontWeight:800,letterSpacing:'.05em',textShadow:'0 0 8px rgba(245,194,0,.3)'}}>{profile.three_b_biz_id}</span>
              </div>
            )}
          </div>
        )}
        {profile && col && (
          <button onClick={signOut} title={`Sign out — ${profile.email}`} style={{padding:'.65rem',borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--muted)',background:'none',border:'none',cursor:'pointer'}}>
            <LogOut size={15}/>
          </button>
        )}

        {!col && (
          <div style={{margin:'0 .45rem',padding:'.5rem .75rem',borderRadius:10,background:'rgba(0,232,176,.06)',border:'1px solid rgba(0,232,176,.2)',display:'flex',alignItems:'center',gap:7}}>
            <div style={{width:7,height:7,borderRadius:'50%',background:'var(--primary)',flexShrink:0,boxShadow:'0 0 8px var(--primary)'}}/>
            <span style={{fontSize:'var(--text-xs)',color:'var(--primary)',fontWeight:700,letterSpacing:'.08em',textShadow:'0 0 8px rgba(0,232,176,.45)'}}>MIS ACTIVE</span>
          </div>
        )}
        <button onClick={()=>setCol(!col)} aria-label={col?'Expand':'Collapse'}
          style={{padding:'.65rem .85rem',borderRadius:10,display:'flex',alignItems:'center',justifyContent:col?'center':'flex-end',gap:6,width:'100%',color:'var(--muted)',fontSize:'var(--text-xs)',transition:'all var(--transition)'}}>
          {col ? <ChevronRight size={15}/> : <><ChevronLeft size={15}/><span>Collapse</span></>}
        </button>
      </div>
    </aside>
  )
}
