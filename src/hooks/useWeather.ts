'use client'
import { useState, useEffect, useCallback } from 'react'
import type { WeatherData, WeatherInfo } from '@/lib/dashboard/types'
import { weatherInfo } from '@/lib/dashboard/helpers'

// Auto-refresh interval — 20 minutes (good balance of 15-30 min ask)
const WEATHER_INTERVAL = 20 * 60 * 1000

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
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m,weather_code,precipitation&wind_speed_unit=mph&temperature_unit=fahrenheit&timezone=auto`
          const res  = await fetch(url)
          const json = await res.json()
          setWeather({
            lat, lng,
            temp:      Math.round(json.current.temperature_2m),
            windSpeed: Math.round(json.current.wind_speed_10m),
            code:      json.current.weather_code,
            precip:    json.current.precipitation ?? 0,
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
