import { Redirect } from 'expo-router';

/** Entry route: the app is guest-first and always opens on the Assistant. */
export default function Index() {
  return <Redirect href="/assistant" />;
}
