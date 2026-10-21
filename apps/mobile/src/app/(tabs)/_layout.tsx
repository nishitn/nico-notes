import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useJournal } from '../../JournalContext';
import { colors } from '../../ui';

export default function TabLayout() {
  const { hasUnread } = useJournal();
  return (
    <NativeTabs
      backBehavior="initialRoute"
      backgroundColor={colors.background}
      tintColor={colors.primary}
      iconColor={{ default: colors.muted, selected: colors.primary }}
      labelStyle={{ default: { color: colors.muted }, selected: { color: colors.primary } }}
      indicatorColor={colors.coralLight}
      badgeBackgroundColor={colors.primary}
      labelVisibilityMode="labeled"
      minimizeBehavior="never"
      disableTransparentOnScrollEdge
    >
      <NativeTabs.Trigger name="index" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="notifications" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Label>Notifications</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'bell', selected: 'bell.fill' }}
          md="notifications"
        />
        {hasUnread && <NativeTabs.Trigger.Badge />}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings" disableAutomaticContentInsets>
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape" md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
