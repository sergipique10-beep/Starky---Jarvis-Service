import styles from './ElectricBackground.module.css';

// Circuit-board-style traces: an SVG path per trace, drawn twice — a dim
// static base and a bright overlay whose stroke-dashoffset animates to
// simulate current flowing along the line. Pure CSS/SVG, no canvas/WebGL,
// so it adds no extra render loop next to the orb's.
const TRACES = [
  { d: 'M0,180 H480 V520 H1100 V220 H1600', duration: '7s', delay: '0s' },
  { d: 'M0,700 H320 V380 H760 V860 H1600', duration: '9s', delay: '-2s' },
  { d: 'M0,900 H640 V560 H1180 V760 H1600', duration: '8s', delay: '-5s' },
  { d: 'M160,0 V300 H760 V60 H1360 V900', duration: '10s', delay: '-1s' },
  { d: 'M1600,340 H1180 V640 H620 V480 H0', duration: '8.5s', delay: '-4s' },
  { d: 'M0,60 H240 V900', duration: '6s', delay: '-3s' },
];

export default function ElectricBackground() {
  return (
    <div className={styles.background} aria-hidden="true">
      <svg
        className={styles.svg}
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMid slice"
      >
        {TRACES.map((trace, i) => (
          <path key={i} className={styles.trace} d={trace.d} />
        ))}
        {TRACES.map((trace, i) => (
          <path
            key={i}
            className={styles.pulse}
            d={trace.d}
            style={{ animationDuration: trace.duration, animationDelay: trace.delay }}
          />
        ))}
      </svg>
    </div>
  );
}
