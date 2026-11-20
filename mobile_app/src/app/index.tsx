import { Redirect } from 'expo-router';

/** Entry route: the app is guest-first and always opens on Chat. */
export default function Index() {
  return <Redirect href="/chat" />;
}
