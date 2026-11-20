import { useRouter } from 'expo-router';

import { PrimaryButton } from '@/components/primary-button';
import { ScreenPlaceholder } from '@/components/screen-placeholder';
import { SecondaryButton } from '@/components/secondary-button';
import { useSession } from '@/lib/session';

/** Sign-in sheet, opened from Pro gates and Settings. TODO(Phase 2): Supabase Auth. */
export default function SignInScreen() {
  const router = useRouter();
  const { signIn } = useSession();

  const dismiss = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/chat');
  };

  return (
    <ScreenPlaceholder
      title="Sign in for Pro"
      description="You can use MyLife AI as a guest. Signing in unlocks Pro features: email and cloud calendar integrations, memory and documents, sync across devices, and higher limits."
      testID="sign-in-screen">
      <PrimaryButton
        label="Continue (dev)"
        onPress={() => {
          signIn();
          dismiss();
        }}
        testID="sign-in-button"
      />
      <SecondaryButton label="Not now" onPress={dismiss} testID="sign-in-dismiss" />
    </ScreenPlaceholder>
  );
}
