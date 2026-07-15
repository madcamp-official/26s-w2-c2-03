import Svg, { Line, Rect, Polyline, Circle, Text as SvgText } from 'react-native-svg';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme';

// 데스크톱(frontend FocusSummaryModal의 FocusGraph)을 react-native-svg로 이식.
// 집중력 게이지(0~100)의 시간 변화 곡선 + 하단에 상태(집중/이탈/휴식) 색 띠.
const BREAK = '#6BA3B0'; // 휴식(데스크톱 --noise 대응)

function stateColor(state) {
  if (state === 'focus') return colors.signal;
  if (state === 'drift') return colors.urgent;
  if (state === 'break') return BREAK;
  return colors.line;
}

function fmt(ms) {
  const totalSec = Math.max(0, Math.round((ms || 0) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}시간 ${m}분`;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}

export default function FocusGraph({ timeline = [], totalElapsedMs }) {
  const width = 720;
  const height = 230;
  const left = 42;
  const right = 14;
  const top = 14;
  const bottom = 42;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const duration = Math.max(1, totalElapsedMs || timeline[timeline.length - 1]?.elapsedMs || 1);
  const samples = timeline.length > 0 ? timeline : [{ elapsedMs: 0, gauge: 50, state: 'focus' }];

  const xOf = (ms) => left + (Math.min(duration, Math.max(0, ms)) / duration) * plotWidth;
  const yOf = (g) => top + (1 - Math.min(100, Math.max(0, g)) / 100) * plotHeight;
  const points = samples.map((p) => `${xOf(p.elapsedMs)},${yOf(p.gauge)}`).join(' ');
  const last = samples[samples.length - 1];

  return (
    <View>
      <Svg width="100%" height={150} viewBox={`0 0 ${width} ${height}`}>
        {[0, 50, 100].map((v) => (
          <Line
            key={`grid-${v}`}
            x1={left}
            y1={yOf(v)}
            x2={width - right}
            y2={yOf(v)}
            stroke={colors.line}
            strokeWidth={1}
          />
        ))}
        {[0, 50, 100].map((v) => (
          <SvgText key={`axis-${v}`} x={left - 9} y={yOf(v) + 5} textAnchor="end" fontSize={13} fill={colors.text2}>
            {v}
          </SvgText>
        ))}

        {samples.map((p, i) => {
          const nextElapsed = samples[i + 1]?.elapsedMs ?? duration;
          const x = xOf(p.elapsedMs);
          return (
            <Rect
              key={`seg-${i}`}
              x={x}
              y={height - bottom + 12}
              width={Math.max(2, xOf(nextElapsed) - x)}
              height={8}
              rx={2}
              fill={stateColor(p.state)}
            />
          );
        })}

        <Polyline points={points} fill="none" stroke={colors.signal} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={xOf(last.elapsedMs)} cy={yOf(last.gauge)} r={5} fill={colors.signal} />

        <SvgText x={left} y={height - 6} textAnchor="start" fontSize={13} fill={colors.text2}>시작</SvgText>
        <SvgText x={width - right} y={height - 6} textAnchor="end" fontSize={13} fill={colors.text2}>{fmt(duration)}</SvgText>
      </Svg>

      <View style={styles.legend}>
        <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: colors.signal }]} /><Text style={styles.legendText}>집중</Text></View>
        <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: colors.urgent }]} /><Text style={styles.legendText}>이탈</Text></View>
        <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: BREAK }]} /><Text style={styles.legendText}>휴식</Text></View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', gap: 14, marginTop: 6, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: colors.text2 },
});
