// @ts-nocheck
import { DollarSign, TrendingUp, Clock } from 'lucide-react-native';
import { ScreenPlaceholder } from '../components/ScreenPlaceholder';

export function EarningsScreen() {
  return (
    <ScreenPlaceholder
      Icon={DollarSign}
      title="Earnings"
      body="Earnings summary isn't available yet."
      items={[
        { Icon: TrendingUp, text: 'Daily & weekly summaries — coming soon' },
        { Icon: Clock,      text: 'Trip-by-trip breakdown — coming soon'   },
      ]}
    />
  );
}
