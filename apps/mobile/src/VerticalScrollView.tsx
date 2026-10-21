import { forwardRef, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type VerticalScrollViewProps = Omit<ScrollViewProps, 'horizontal'> & {
  containerStyle?: StyleProp<ViewStyle>;
};

export const VerticalScrollView = forwardRef<ScrollView, VerticalScrollViewProps>(
  function VerticalScrollView(
    { containerStyle, onLayout, onContentSizeChange, onScroll, scrollEventThrottle = 16, ...props },
    ref,
  ) {
    const metrics = useRef({ height: 0, contentHeight: 0, offset: 0 });
    const [edges, setEdges] = useState({ top: false, bottom: false });

    function updateEdges(next: Partial<typeof metrics.current>) {
      Object.assign(metrics.current, next);
      const { height, contentHeight, offset } = metrics.current;
      const top = height > 0 && offset > 1;
      const bottom = height > 0 && contentHeight - height - offset > 1;
      setEdges((previous) =>
        previous.top === top && previous.bottom === bottom ? previous : { top, bottom },
      );
    }

    return (
      <View style={[scrollShadows.container, containerStyle]}>
        <ScrollView
          {...props}
          ref={ref}
          scrollEventThrottle={scrollEventThrottle}
          onLayout={(event) => {
            updateEdges({ height: event.nativeEvent.layout.height });
            onLayout?.(event);
          }}
          onContentSizeChange={(width, height) => {
            updateEdges({ contentHeight: height });
            onContentSizeChange?.(width, height);
          }}
          onScroll={(event) => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            updateEdges({
              offset: contentOffset.y,
              contentHeight: contentSize.height,
              height: layoutMeasurement.height,
            });
            onScroll?.(event);
          }}
        />
        {edges.top && (
          <View pointerEvents="none" style={[scrollShadows.shadow, scrollShadows.top]} />
        )}
        {edges.bottom && (
          <View pointerEvents="none" style={[scrollShadows.shadow, scrollShadows.bottom]} />
        )}
      </View>
    );
  },
);

export function renderVerticalScrollView(props: ScrollViewProps) {
  return <VerticalScrollView {...props} containerStyle={scrollShadows.fill} />;
}

const scrollShadows = StyleSheet.create({
  fill: { flex: 1 },
  container: {
    minHeight: 0,
    overflow: 'hidden',
  },
  shadow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 12,
  },
  top: {
    top: 0,
    experimental_backgroundImage:
      'linear-gradient(to bottom, rgba(48, 43, 38, 0.14), rgba(48, 43, 38, 0))',
  },
  bottom: {
    bottom: 0,
    experimental_backgroundImage:
      'linear-gradient(to top, rgba(48, 43, 38, 0.14), rgba(48, 43, 38, 0))',
  },
});
