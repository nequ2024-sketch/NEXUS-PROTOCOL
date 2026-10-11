import { useEffect, useMemo, useRef } from 'react';
import {
  CandlestickSeries, ColorType, createChart, HistogramSeries, LineSeries,
  type IChartApi, type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle, TerminalSymbol, TerminalTimeframe } from '@/hooks/use-binance-market';

type Props = { candles: Candle[]; symbol: TerminalSymbol; timeframe: TerminalTimeframe; loading: boolean; error: string | null; onRetry: () => void };

function ema(values: number[], period: number) {
  const alpha = 2 / (period + 1);
  let value = values[0];
  return values.map((current, index) => {
    value = index === 0 ? current : current * alpha + value * (1 - alpha);
    return { index, value };
  });
}

export function ChartPanel({ candles, symbol, timeframe, loading, error, onRetry }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const fittedContext = useRef('');
  const seriesRef = useRef<{ candle: ReturnType<IChartApi['addSeries']>; volume: ReturnType<IChartApi['addSeries']>; ema20: ReturnType<IChartApi['addSeries']>; ema50: ReturnType<IChartApi['addSeries']>; upper: ReturnType<IChartApi['addSeries']>; lower: ReturnType<IChartApi['addSeries']> } | null>(null);
  const validCandles = useMemo(() => candles.filter((candle) => [candle.time, candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite)), [candles]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const chart = createChart(host, {
      width: host.clientWidth,
      height: host.clientHeight,
      layout: { background: { type: ColorType.Solid, color: '#0b0f13' }, textColor: '#7e8985', fontFamily: 'DM Mono, monospace', fontSize: 10 },
      grid: { vertLines: { color: 'rgba(154,177,169,.08)' }, horzLines: { color: 'rgba(154,177,169,.08)' } },
      crosshair: { vertLine: { color: 'rgba(0,229,255,.36)' }, horzLine: { color: 'rgba(0,229,255,.28)' } },
      rightPriceScale: { borderColor: 'rgba(154,177,169,.18)', scaleMargins: { top: 0.1, bottom: 0.25 } },
      timeScale: { borderColor: 'rgba(154,177,169,.18)', timeVisible: true, secondsVisible: false, rightOffset: 6 },
      localization: { priceFormatter: (price: number) => price.toLocaleString('en-US', { maximumFractionDigits: price < 1 ? 6 : 2 }) },
    });
    const candle = chart.addSeries(CandlestickSeries, { upColor: '#00ff9d', downColor: '#e05467', borderUpColor: '#00ff9d', borderDownColor: '#e05467', wickUpColor: '#00ff9d', wickDownColor: '#e05467', priceLineVisible: false });
    const ema20 = chart.addSeries(LineSeries, { color: '#ffd700', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const ema50 = chart.addSeries(LineSeries, { color: '#ff3de8', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const upper = chart.addSeries(LineSeries, { color: 'rgba(255,61,232,.42)', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
    const lower = chart.addSeries(LineSeries, { color: 'rgba(255,61,232,.42)', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    chartRef.current = chart;
    seriesRef.current = { candle, volume, ema20, ema50, upper, lower };
    const observer = new ResizeObserver(([entry]) => {
      if (entry && chartRef.current) chartRef.current.applyOptions({ width: Math.max(320, Math.floor(entry.contentRect.width)), height: Math.max(220, Math.floor(entry.contentRect.height)) });
    });
    observer.observe(host);
    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series || !validCandles.length) return;
    const closes = validCandles.map((candle) => candle.close);
    const times = validCandles.map((candle) => candle.time as UTCTimestamp);
    series.candle.setData(validCandles.map((candle) => ({ time: candle.time as UTCTimestamp, open: candle.open, high: candle.high, low: candle.low, close: candle.close })));
    series.volume.setData(validCandles.map((candle) => ({ time: candle.time as UTCTimestamp, value: candle.volume, color: candle.close >= candle.open ? 'rgba(0,255,157,.35)' : 'rgba(224,84,103,.35)' })));
    const e20 = ema(closes, 20);
    const e50 = ema(closes, 50);
    series.ema20.setData(e20.slice(19).map((point) => ({ time: times[point.index], value: point.value })));
    series.ema50.setData(e50.slice(49).map((point) => ({ time: times[point.index], value: point.value })));
    const band = validCandles.map((_, i) => {
      if (i < 19) return null;
      const window = closes.slice(i - 19, i + 1);
      const average = window.reduce((sum, value) => sum + value, 0) / 20;
      const deviation = Math.sqrt(window.reduce((sum, value) => sum + (value - average) ** 2, 0) / 20);
      return { time: times[i], upper: average + 2 * deviation, lower: average - 2 * deviation };
    }).filter((point): point is NonNullable<typeof point> => point !== null);
    series.upper.setData(band.map(({ time, upper }) => ({ time, value: upper })));
    series.lower.setData(band.map(({ time, lower }) => ({ time, value: lower })));
    const context = `${symbol}:${timeframe}`;
    if (fittedContext.current !== context) {
      chart.timeScale().fitContent();
      fittedContext.current = context;
    }
  }, [validCandles, symbol, timeframe]);

  return <section className="terminal-chart-card">
    <div className="terminal-chart-heading">
      <div><div className="terminal-panel-label">PRICE ACTION <span>/</span> {timeframe.toUpperCase()}</div><div className="terminal-indicators"><i className="ind-ema20" /> EMA 20 <i className="ind-ema50" /> EMA 50 <i className="ind-bb" /> BOLLINGER 20,2 <i className="ind-vol" /> VOLUME</div></div>
      <span className="terminal-market-note">BINANCE SPOT · PUBLIC MARKET DATA</span>
    </div>
    <div className="terminal-chart-wrap" aria-label="Candlestick and volume market chart"><div className="terminal-chart" ref={hostRef} />
      {loading && <div className="terminal-chart-overlay"><div className="chart-load-bars"><i /><i /><i /><i /><i /></div><span>LOADING PUBLIC KLINES</span></div>}
      {!loading && error && <div className="terminal-chart-overlay"><strong>MARKET DATA UNAVAILABLE</strong><span>{error}</span><button onClick={onRetry} data-testid="button-retry-klines">RETRY KLINE REQUEST</button></div>}
      {!loading && !error && !validCandles.length && <div className="terminal-chart-overlay"><span>WAITING FOR MARKET DATA</span></div>}
    </div>
  </section>;
}

