import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

const FeatureList = [
  {
    title: 'Hardware-First',
    description: (
      <>
        CPU registers, bank boundaries, and processor modes are first-class
        language concepts. Write code that maps directly to 65816 instructions
        with full control over the hardware.
      </>
    ),
  },
  {
    title: 'Type Safe',
    description: (
      <>
        Catch bank overflow, mode mismatches, and size errors at compile time.
        Explicit type conversions and register-aware type checking prevent
        entire classes of 65816 bugs.
      </>
    ),
  },
  {
    title: 'Zero Abstraction Cost',
    description: (
      <>
        Every high-level construct compiles to efficient assembly matching
        hand-written code. No runtime overhead, no hidden allocations, no
        surprises in the generated output.
      </>
    ),
  },
];

function Feature({title, description}) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
