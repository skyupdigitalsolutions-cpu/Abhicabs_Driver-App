// @ts-nocheck
/**
 * Logo — the ABHI CABS brand logo as an <Image>.
 * Variants: color (light bg), white (dark bg), mark (square emblem).
 */
import { Image } from 'react-native';

const SOURCES = {
  color: require('../../assets/logo-color.png'),
  white: require('../../assets/logo-white.png'),
  mark:  require('../../assets/logo-mark.png'),
};
const RATIO = { color: 341 / 900, white: 341 / 900, mark: 495 / 512 };

export function Logo({ variant = 'color', width = 200, style }) {
  return (
    <Image
      source={SOURCES[variant]}
      style={[{ width, height: Math.round(width * RATIO[variant]) }, style]}
      resizeMode="contain"
      accessibilityLabel="ABHI CABS"
    />
  );
}
