import {forwardRef, type ComponentProps} from 'react';
import {Img, OffthreadVideo} from 'remotion';
import {Video} from '@remotion/media';

import {isManagedObjectUrl} from './managed-media-policy';

export const ManagedImg = forwardRef<HTMLImageElement, ComponentProps<typeof Img>>((props, ref) => (
  <Img {...props} ref={ref} crossOrigin={isManagedObjectUrl(props.src) && !props.effects?.length ? 'anonymous' : props.crossOrigin} />
));
ManagedImg.displayName = 'ManagedImg';

export function ManagedOffthreadVideo(props: ComponentProps<typeof OffthreadVideo>) {
  return <OffthreadVideo {...props} crossOrigin={isManagedObjectUrl(props.src) ? 'anonymous' : props.crossOrigin} />;
}

/** Keep native fallback and decoder fetches under the same managed-media policy. */
export function ManagedVideo(props: ComponentProps<typeof Video>) {
  if (!isManagedObjectUrl(props.src)) return <Video {...props} />;
  return <Video {...props} credentials="omit" requestInit={{...props.requestInit, credentials: 'omit'}}
    fallbackOffthreadVideoProps={{...props.fallbackOffthreadVideoProps, crossOrigin: 'anonymous'}} />;
}
