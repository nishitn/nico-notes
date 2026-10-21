import { router } from 'expo-router';
import { Button, Page, Title } from '../ui';

export default function NotFound() {
  return (
    <Page>
      <Title>Page not found</Title>
      <Button title="Go home" onPress={() => router.replace('/')} />
    </Page>
  );
}
