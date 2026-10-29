// @ts-nocheck
/**
 * Logo — the ABHI CABS brand logo as an <Image>.
 *
 * Variants:
 *   color  horizontal wordmark for LIGHT backgrounds (default)
 *   white  horizontal wordmark for DARK backgrounds (e.g. black headers)
 *   mark   the square road+pin emblem (yellow badge)
 *
 * PNGs are used (not the raw SVGs) because the wordmark contains live SF Pro
 * text that wouldn't render consistently across platforms as SVG. Pass `width`
 * and the height is derived from each asset's aspect ratio.
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
      accessibilitylabel="ABHI CABS"
    />
  );
}
