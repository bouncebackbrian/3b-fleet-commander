'use client'
import { useState, useEffect } from 'react'
import type { WeatherData, WeatherInfo } from '@/lib/dashboard/types'
import { weatherInfo } from '@/lib/dashboard/helpers'

export function useWeather() {
  const [weather,        setWeather]        = useState<WeatherData | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(false)

  useEffect(() => {
    if (!navigator.geolocation) return
    setWeatherLoading(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude: lat, longitude: lng } = pos.coords
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m,weather_code,precipitation&wind_speed_unit=mph&temperature_unit=fahrenheit&timezone=auto`
          const res = await fetch(url)
          const json = await res.json()
          setWeather({
            lat, lng,
            temp:      Math.round(json.current.temperature_2m),
            windSpeed: Math.round(json.current.wind_speed_10m),
            code:      json.current.weather_code,
            precip:    json.current.precipitation ?? 0,
          })
        } catch { /* weather unavailable */ }
        finally { setWeatherLoading(false) }
      },
      () => setWeatherLoading(false),
      { timeout: 8000, maximumAge: 300_000 }
    )
  }, [])

  const wx: WeatherInfo | null = weather ? weatherInfo(weather.code) : null

  return { weather, weatherLoading, wx }
}
