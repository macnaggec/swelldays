import { useCallback, useState, type ReactElement } from 'react';
import { Button, Group, Input, PasswordInput, Stack, TextInput } from '@mantine/core';
import { signUp } from 'shared/lib/auth';
import classes from './AuthForm.module.css';

interface RegisterFormProps {
  onSuccess?: () => void;
}

export function RegisterForm({ onSuccess }: RegisterFormProps): ReactElement {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsPending(true);
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get('password'));
    const confirm = String(fd.get('confirmPassword'));

    if (password !== confirm) {
      setError("Passwords don't match");
      setIsPending(false);
      return;
    }

    const result = await signUp.email({
      email: String(fd.get('email')),
      password,
      name: String(fd.get('name')),
    }).catch((err: unknown) => ({ error: { message: String(err) } }));

    if ('error' in result && result.error) {
      setError(result.error.message ?? 'Registration failed');
      setIsPending(false);
      return;
    }

    onSuccess?.();
  }, [onSuccess]);

  return (
    <form onSubmit={handleSubmit}>
      <Stack>
        <TextInput
          name="name"
          label="Name"
          placeholder="Your name"
          required
          minLength={2}
          autoComplete="name"
          classNames={{ input: classes.input }}
        />
        <TextInput
          name="email"
          type="email"
          label="Email"
          placeholder="hello@swelldays.com"
          required
          autoComplete="email"
          classNames={{ input: classes.input }}
        />
        <PasswordInput
          name="password"
          label="Password"
          placeholder="Your password"
          required
          minLength={6}
          autoComplete="new-password"
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
        <PasswordInput
          name="confirmPassword"
          label="Confirm password"
          placeholder="Confirm your password"
          required
          minLength={6}
          autoComplete="new-password"
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
        {error && <Input.Error>{error}</Input.Error>}
        <Group justify="center" mt="calc(var(--mantine-spacing-xl) + 1px)">
          <Button type="submit" loading={isPending} className={classes.submit}>Register</Button>
        </Group>
      </Stack>
    </form>
  );
}
