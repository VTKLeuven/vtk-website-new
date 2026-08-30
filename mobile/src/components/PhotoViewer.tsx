import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AppPhoto } from '../api/contract';
import { COLORS, SPACING, TYPE } from '../theme/tokens';

/** Hoe ver je mag inzoomen. Meer dan dit toont enkel nog de korrel. */
const MAX_SCALE = 4;

/** Waarheen een dubbeltik zoomt. */
const TAP_SCALE = 2.5;

/**
 * De schermvullende fotoviewer: vegen tussen de foto's, knijpen om in te zoomen.
 *
 * **Waarom dit een eigen component is.** Het zat in `album/[slug].tsx` als één
 * `<Image>` in een `Modal`, zonder enige manier om naar de volgende foto te gaan
 * behalve sluiten en opnieuw tikken. Met albums van zeventienhonderd foto's is
 * dat geen viewer maar een doodlopende weg.
 *
 * Bladeren gebeurt met een gewone horizontale `FlatList` op `pagingEnabled`, niet
 * met een pager-bibliotheek: de app staat vast in portret, dus de paginabreedte
 * is de schermbreedte en `getItemLayout` klopt altijd.
 *
 * De knoppen bovenaan komen van de beller mee. De viewer weet niet wat "bewaren"
 * betekent; hij weet enkel welke foto in beeld staat.
 */
export function PhotoViewer({
  photos,
  index,
  onIndexChange,
  onClose,
  actions,
}: {
  photos: AppPhoto[];
  /** De foto die openstaat, of `null` wanneer de viewer dicht is. */
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** De knoppen rechtsboven, bv. delen en bewaren. */
  actions?: React.ReactNode;
}) {
  return (
    <Modal
      visible={index !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      // Zonder dit staat de statusbalk op Android over de foto.
      statusBarTranslucent
    >
      {/* Een tweede `GestureHandlerRootView`, binnen de modal. Een modal is een
          eigen native venster, dus gebaren erin bereiken de root buiten de modal
          niet: zonder deze wrapper doet knijpen gewoon niets, zonder foutmelding
          en zonder dat er iets in de logs verschijnt. */}
      <GestureHandlerRootView style={styles.root}>
        {index !== null ? (
          <Pager
            photos={photos}
            initialIndex={index}
            index={index}
            onIndexChange={onIndexChange}
            onClose={onClose}
            actions={actions}
          />
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

function Pager({
  photos,
  initialIndex,
  index,
  onIndexChange,
  onClose,
  actions,
}: {
  photos: AppPhoto[];
  initialIndex: number;
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  actions?: React.ReactNode;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Bladeren gaat uit zodra er ingezoomd is; anders vecht het slepen binnen de
  // foto met het omslaan naar de volgende.
  const [zoomed, setZoomed] = useState(false);

  const onMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(event.nativeEvent.contentOffset.x / width);
      if (next !== index && next >= 0 && next < photos.length) onIndexChange(next);
    },
    [width, index, photos.length, onIndexChange],
  );

  return (
    <View style={styles.viewer}>
      <FlatList
        data={photos}
        keyExtractor={(photo) => photo.id}
        horizontal
        pagingEnabled
        scrollEnabled={!zoomed}
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={onMomentumEnd}
        // Enkel de buren inladen. Een album van zeventienhonderd foto's mag niet
        // zeventienhonderd keer `expo-image` monteren om er één te tonen.
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
        removeClippedSubviews
        renderItem={({ item, index: position }) => (
          <ZoomablePhoto
            photo={item}
            width={width}
            height={height}
            active={position === index}
            onZoomChange={setZoomed}
          />
        )}
      />

      <View style={[styles.bar, { top: insets.top + SPACING.md }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sluiten"
          onPress={onClose}
          hitSlop={14}
          style={styles.button}
        >
          <X color={COLORS.onDark} size={24} />
        </Pressable>
        {actions}
      </View>

      <Text style={[styles.counter, { bottom: insets.bottom + SPACING.xl }]}>
        {index + 1} van {photos.length}
      </Text>
    </View>
  );
}

/**
 * Eén foto, met knijpen, slepen en dubbeltikken.
 *
 * Zodra de foto niet meer op ware grootte staat, meldt ze dat naar boven zodat de
 * pager stopt met bladeren. Bij het wegbladeren springt ze terug: niemand
 * verwacht dat de volgende foto al ingezoomd begint.
 */
function ZoomablePhoto({
  photo,
  width,
  height,
  active,
  onZoomChange,
}: {
  photo: AppPhoto;
  width: number;
  height: number;
  active: boolean;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  const reset = useCallback(() => {
    scale.value = withTiming(1);
    savedScale.value = 1;
    x.value = withTiming(0);
    y.value = withTiming(0);
    savedX.value = 0;
    savedY.value = 0;
  }, [scale, savedScale, x, y, savedX, savedY]);

  // Blader je weg, dan gaat deze foto terug naar ware grootte.
  useEffect(() => {
    if (!active) {
      reset();
      onZoomChange(false);
    }
  }, [active, reset, onZoomChange]);

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = Math.min(Math.max(savedScale.value * event.scale, 0.5), MAX_SCALE);
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        x.value = withTiming(0);
        y.value = withTiming(0);
        savedX.value = 0;
        savedY.value = 0;
        runOnJS(onZoomChange)(false);
      } else {
        savedScale.value = scale.value;
        runOnJS(onZoomChange)(scale.value > 1);
      }
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((event) => {
      // Slepen heeft enkel zin wanneer er meer foto is dan er past.
      if (savedScale.value <= 1) return;
      x.value = savedX.value + event.translationX;
      y.value = savedY.value + event.translationY;
    })
    .onEnd(() => {
      savedX.value = x.value;
      savedY.value = y.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (savedScale.value > 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        x.value = withTiming(0);
        y.value = withTiming(0);
        savedX.value = 0;
        savedY.value = 0;
        runOnJS(onZoomChange)(false);
      } else {
        scale.value = withTiming(TAP_SCALE);
        savedScale.value = TAP_SCALE;
        runOnJS(onZoomChange)(true);
      }
    });

  const gesture = Gesture.Exclusive(doubleTap, Gesture.Simultaneous(pinch, pan));

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ width, height }, styles.page]}>
        <Animated.View style={[styles.page, animated]}>
          <Image
            source={{ uri: photo.url }}
            style={styles.full}
            contentFit="contain"
            transition={150}
            recyclingKey={photo.id}
            accessibilityLabel={photo.filename}
          />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Bewust bijna zwart en niet navy: een foto beoordeel je niet tegen een
  // gekleurde achtergrond.
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)' },
  page: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  full: { width: '100%', height: '100%' },
  bar: {
    position: 'absolute',
    left: SPACING.lg,
    right: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    // Een lichte vulling, zodat de icoontjes ook op een lichte foto leesbaar zijn.
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  counter: { ...TYPE.small, color: COLORS.onDarkMuted, alignSelf: 'center', position: 'absolute' },
});
