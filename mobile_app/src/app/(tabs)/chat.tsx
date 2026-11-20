import { useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { PrimaryButton } from '@/components/primary-button';
import { ScreenPlaceholder } from '@/components/screen-placeholder';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Chat with the agent.
 * TODO(Phase 2): stream replies from POST /chat (SSE) and render tool calls as cards.
 */
export default function ChatScreen() {
  const colors = useTheme();
  const [message, setMessage] = useState('');

  const send = () => {
    if (message.trim().length === 0) return;
    setMessage('');
  };

  return (
    <ScreenPlaceholder
      title="Chat"
      description="Ask MyLife AI to do things for you."
      testID="chat-screen">
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable
          accessible={false}
          style={styles.flex}
          onPress={Keyboard.dismiss}
          testID="chat-messages-area"
        />
        <View style={styles.composer}>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Remind me to check my emails at 9 AM"
            placeholderTextColor={colors.textSecondary}
            style={[
              styles.input,
              {
                color: colors.text,
                backgroundColor: colors.backgroundElement,
                borderColor: colors.border,
              },
            ]}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={send}
            testID="chat-input"
          />
          <PrimaryButton
            label="Send"
            disabled={message.trim().length === 0}
            onPress={send}
            testID="send-button"
          />
        </View>
      </KeyboardAvoidingView>
    </ScreenPlaceholder>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  composer: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
});
