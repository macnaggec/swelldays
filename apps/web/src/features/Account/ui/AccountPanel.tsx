import { Avatar, Skeleton, Text } from '@mantine/core';
import { DeleteAccountPanel, type DeleteAccountPanelProps } from './DeleteAccountPanel';
import classes from './AccountPanel.module.css';

export interface AccountIdentity {
  name: string | null;
  email: string;
  image?: string | null;
}

export interface AccountPanelProps extends DeleteAccountPanelProps {
  identity: AccountIdentity;
}

const toInitials = ({ name, email }: AccountIdentity) =>
  (name ?? email).slice(0, 2).toUpperCase();

export function AccountPanel({ identity, ...deletion }: AccountPanelProps) {
  return (
    <section className={classes.root} aria-label="Account">
      <header className={classes.identity}>
        <Avatar
          src={identity.image ?? undefined}
          alt={identity.name ?? identity.email}
          size={52}
          radius="xl"
          color="gray"
          variant="outline"
        >
          {toInitials(identity)}
        </Avatar>
        <div className={classes.identityText}>
          <Text className={classes.identityName}>{identity.name ?? 'Your account'}</Text>
          <Text className={classes.identityEmail}>{identity.email}</Text>
        </div>
      </header>

      <div className={classes.divider} />

      <DeleteAccountPanel {...deletion} />
    </section>
  );
}

export function AccountPanelSkeleton() {
  return (
    <section className={classes.root} aria-busy="true">
      <Text className={classes.screenReaderOnly}>Loading your account</Text>

      <div className={classes.identity}>
        <Skeleton height={52} circle />
        <div className={classes.identityText}>
          <Skeleton height={16} width={172} radius="sm" />
          <Skeleton height={11} width={212} radius="sm" mt={9} />
        </div>
      </div>

      <div className={classes.divider} />

      <div className={classes.dangerSkeleton}>
        <Skeleton height={16} width={124} radius="sm" />
        <Skeleton height={12} width="78%" radius="sm" />
        <Skeleton height={34} width={152} radius="md" />
      </div>
    </section>
  );
}
