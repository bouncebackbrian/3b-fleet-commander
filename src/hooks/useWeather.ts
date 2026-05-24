'use client'
import { useState, useEffect, useCallback } from 'react'
import type { WeatherData, WeatherInfo } from '@/lib/dashboard/types'
import { weatherInfo } from '@/lib/dashboard/helpers'

// Auto-refresh interval — 30 minutes (trucking operational cadence)
const WEATHER_INTERVAL = 30 * 60 * 1000

export function useWeather() {
  const [weather,        setWeather]        = useState<WeatherData | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [lastUpdated,    setLastUpdated]    = useState<Date | null>(null)

  const fetchWeather = useCallback(() => {
    if (!navigator.geolocation) return
    setWeatherLoading(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude: lat, longitude: lng } = pos.coords
          // current: add wind_gusts_10m + visibility (meters)
          // hourly precipitation_probability for next 3 hours → rain timing
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m,wind_gusts_10m,weather_code,precipitation,visibility&hourly=precipitation_probability&forecast_hours=3&wind_speed_unit=mph&temperature_unit=fahrenheit&timezone=auto`
          const res  = await fetch(url)
          const json = await res.json()
          const curr = json.current

          // Visibility: open-meteo returns meters — convert to miles (1 decimal)
          const visMiles = curr.visibility != null
            ? Math.round(curr.visibility * 0.000621371 * 10) / 10
            : undefined

          // Rain probability: max of next 3 hourly values
          const hourlyProb: number[] = json.hourly?.precipitation_probability ?? []
          const precipProbNext2h = hourlyProb.length > 0
            ? Math.max(...hourlyProb.slice(0, 3))
            : undefined

          setWeather({
            lat, lng,
            temp:             Math.round(curr.temperature_2m),
            windSpeed:        Math.round(curr.wind_speed_10m),
            code:             curr.weather_code,
            precip:           curr.precipitation ?? 0,
            windGusts:        curr.wind_gusts_10m != null ? Math.round(curr.wind_gusts_10m) : undefined,
            visibility:       visMiles,
            precipProbNext2h,
          })
          setLastUpdated(new Date())
        } catch { /* weather unavailable — keep last known */ }
        finally { setWeatherLoading(false) }
      },
      () => setWeatherLoading(false),
      // maximumAge: 60s so each auto-refresh gets a fresh GPS fix, not cached
      { timeout: 10_000, maximumAge: 60_000 },
    )
  }, [])

  // Initial fetch + interval auto-refresh
  useEffect(() => {
    fetchWeather()
    const id = setInterval(fetchWeather, WEATHER_INTERVAL)
    return () => clearInterval(id)
  }, [fetchWeather])

  const wx: WeatherInfo | null = weather ? weatherInfo(weather.code) : null

  return { weather, weatherLoading, wx, lastUpdated, refresh: fetchWeather }
}
