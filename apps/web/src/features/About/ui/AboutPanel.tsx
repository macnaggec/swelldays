import { Anchor, Text, ThemeIcon } from '@mantine/core';
import { IconCamera, IconMail, IconSearch } from '@tabler/icons-react';
import materials from 'shared/ui/design-system/materials.module.css';
import classes from './AboutPanel.module.css';

const FEEDBACK_EMAIL = 'macnaggec@gmail.com';

export function AboutPanel() {
  return (
    <div className={classes.root}>
      <Text className={classes.intro}>
        Swelldays is a map of surf spots. Photographers publish photos and videos from their
        sessions, and surfers search, preview, and buy them by spot and date.
      </Text>

      <div className={classes.divider} />

      <div className={classes.cardStack}>
        <div className={`${materials.panel} ${classes.card}`}>
          <ThemeIcon className={classes.cardIcon} variant="light" color="gray" radius="md">
            <IconCamera size={18} stroke={1.75} />
          </ThemeIcon>
          <div>
            <Text component="h2" className={classes.cardTitle}>
              For photographers
            </Text>
            <Text className={classes.cardBody}>
              Upload a session, attach it to the spot where you shot it, set a price, and
              publish. Buyers can browse and buy whatever you make public.
            </Text>
          </div>
        </div>

        <div className={`${materials.panel} ${classes.card}`}>
          <ThemeIcon className={classes.cardIcon} variant="light" color="gray" radius="md">
            <IconSearch size={18} stroke={1.75} />
          </ThemeIcon>
          <div>
            <Text component="h2" className={classes.cardTitle}>
              For surfers
            </Text>
            <Text className={classes.cardBody}>
              Search the map by spot and date to find sessions you were in. Preview and buy the
              shots you want, then download them from your purchases.
            </Text>
          </div>
        </div>

        <div className={`${materials.panel} ${classes.card}`}>
          <ThemeIcon className={classes.cardIcon} variant="light" color="gray" radius="md">
            <IconMail size={18} stroke={1.75} />
          </ThemeIcon>
          <div>
            <Text component="h2" className={classes.cardTitle}>
              Feedback
            </Text>
            <Text className={classes.cardBody}>
              Found a bug or have an idea?{' '}
              <Anchor href={`mailto:${FEEDBACK_EMAIL}`} className={classes.feedbackLink}>
                Email {FEEDBACK_EMAIL}
              </Anchor>
              .
            </Text>
          </div>
        </div>
      </div>
    </div>
  );
}
