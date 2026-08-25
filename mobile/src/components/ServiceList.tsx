import { useState } from 'react';
import { ChevronDown } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppServiceStatus } from '../api/contract';
import { COLORS, RADIUS, SPACING, TYPE } from '../theme/tokens';

/**
 * Theokot, cursusdienst en 't ElixIr: open of niet, en tot hoe laat.
 *
 * Dit is de vraag die het vaakst gesteld wordt en daarom staat ze bovenaan Home,
 * boven de vouw. De site zet drie weekroosters naast elkaar; op een telefoon is
 * dat drie keer zeven regels waar je doorheen moet lezen voor je weet of je nu
 * kan gaan. Hier staat het antwoord vooraan en het rooster erachter: tik een
 * dienst aan en de week klapt open.
 *
 * **Het rekenwerk gebeurt op de server** (`lib/app-api/serviceStatus.ts`). De
 * openingsuren staan in wandkloktijd van Brussel, en een telefoon staat niet
 * noodzakelijk op die tijdzone; het hier nog eens uitrekenen zou betekenen dat de
 * app op reis andere uren toont dan de site.
 *
 * Naam, toestand en uur staan als drie kolommen naast elkaar en niet als één zin
 * met puntjes ertussen. Dat is de regel over gelabelde kolommen uit CLAUDE.md.
 */
export function ServiceList({ services }: { services: AppServiceStatus[] }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <View style={styles.list}>
      {services.map((service, index) => {
        const expanded = open === service.key;
        const hasSchedule = service.entries.length > 0;

        return (
          <View key={service.key}>
            <Pressable
              accessibilityRole={hasSchedule ? 'button' : 'text'}
              accessibilityState={hasSchedule ? { expanded } : undefined}
              accessibilityLabel={`${service.name}, ${service.openNow ? 'open' : 'gesloten'}, ${service.detail}`}
              disabled={!hasSchedule}
              onPress={() => setOpen(expanded ? null : service.key)}
              style={({ pressed }) => [
                styles.row,
                index > 0 && styles.divided,
                pressed && hasSchedule && styles.pressed,
              ]}
            >
              <Text style={styles.name} numberOfLines={1}>
                {service.name}
              </Text>

              {service.unavailable ? (
                <Text style={styles.unavailable} numberOfLines={1}>
                  {service.detail}
                </Text>
              ) : (
                <>
                  <View style={styles.state}>
                    <View style={[styles.pip, service.openNow ? styles.pipOpen : styles.pipShut]} />
                    <Text style={service.openNow ? styles.openText : styles.shutText}>
                      {service.openNow ? 'Open' : 'Gesloten'}
                    </Text>
                  </View>
                  <Text style={styles.detail} numberOfLines={1}>
                    {service.detail}
                  </Text>
                </>
              )}

              {hasSchedule ? (
                <ChevronDown
                  color={COLORS.muted}
                  size={15}
                  style={expanded ? styles.chevronOpen : undefined}
                />
              ) : null}
            </Pressable>

            {expanded ? (
              <View style={styles.schedule}>
                {service.entries.map((entry) => (
                  <View key={entry.day} style={styles.scheduleRow}>
                    <Text style={styles.scheduleDay} numberOfLines={1}>
                      {entry.day}
                    </Text>
                    <Text style={styles.scheduleHours} numberOfLines={1}>
                      {entry.hours}
                    </Text>
                  </View>
                ))}
                {service.note ? <Text style={styles.note}>{service.note}</Text> : null}
                {service.live ? (
                  <Text style={styles.note}>
                    De toestand hierboven is live gemeten en kan van het rooster afwijken.
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.line,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  divided: { borderTopWidth: 1, borderTopColor: COLORS.line },
  pressed: { backgroundColor: COLORS.paper2 },
  name: { ...TYPE.body, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.ink, flex: 1 },
  state: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pip: { width: 6, height: 6, borderRadius: 3 },
  pipOpen: { backgroundColor: COLORS.yellowDeep },
  pipShut: { backgroundColor: COLORS.muted, opacity: 0.5 },
  openText: { ...TYPE.small, fontFamily: TYPE.cardTitle.fontFamily, color: COLORS.ink },
  shutText: { ...TYPE.small, color: COLORS.muted },
  detail: { ...TYPE.small, color: COLORS.muted, minWidth: 74, textAlign: 'right' },
  unavailable: { ...TYPE.small, color: COLORS.muted, flexShrink: 1, textAlign: 'right' },
  chevronOpen: { transform: [{ rotate: '180deg' }] },

  schedule: {
    backgroundColor: COLORS.paper2,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    gap: 3,
  },
  scheduleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: SPACING.md },
  scheduleDay: { ...TYPE.small, color: COLORS.muted, flex: 1 },
  scheduleHours: { ...TYPE.small, color: COLORS.body },
  note: { ...TYPE.small, color: COLORS.muted, marginTop: SPACING.sm },
});
