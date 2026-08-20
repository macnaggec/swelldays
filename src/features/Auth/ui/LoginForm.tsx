import { useCallback, useState, type ReactElement } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button, Group, Input, PasswordInput, Stack, TextInput } from '@mantine/core';
import { signIn } from 'shared/lib/auth';
import classes from './AuthForm.module.css';

interface LoginFormProps {
  onSuccess?: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps): ReactElement {
  const navigate = useNavigate();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsPending(true);
    const fd = new FormData(e.currentTarget);

    const result = await signIn.email({
      email: String(fd.get('email')),
      password: String(fd.get('password')),
    }).catch((err: unknown) => ({ error: { message: String(err) } }));

    if ('error' in result && result.error) {
      setError(result.error.message ?? 'Authentication failed');
      setIsPending(false);
      return;
    }

    if (onSuccess) {
      onSuccess();
    } else {
      navigate({ to: '/' });
    }
  }, [navigate, onSuccess]);

  return (
    <form onSubmit={handleSubmit}>
      <Stack>
        <TextInput
          name="email"
          type="email"
          label="Email"
          placeholder="hello@swelldays.com"
          required
          autoComplete="email"
          classNames={{ input: classes.input }}
        />
        <div className={classes.passwordField}>
          <PasswordInput
            name="password"
            label="Password"
            placeholder="Your password"
            required
            minLength={6}
            autoComplete="current-password"
            rightSectionWidth="var(--wa-control-height-default)"
            visibilityToggleButtonProps={{
              'aria-label': 'Toggle password visibility',
              tabIndex: 0,
            }}
            classNames={{
              input: classes.input,
              innerInput: classes.innerInput,
              visibilityToggle: classes.visibilityToggle,
            }}
          />
          <div className={classes.errorSlot} aria-live="polite" aria-atomic="true">
            {error && <Input.Error>{error}</Input.Error>}
          </div>
        </div>
        <Group justify="center" mt="calc(var(--mantine-spacing-xl) + 1px)">
          <Button type="submit" loading={isPending} className={classes.submit}>Sign in</Button>
        </Group>
      </Stack>
    </form>
  );
}
