# Animate Image

`video_editing.animate_image` restyles the first frame of a required driver video with a required style image, then uses the driver motion for WAN Animate Move. It writes the extracted frame, styled image, and any generated animation under Runtime's assigned output directory and returns a universal result receipt. The concrete animation is primary when generated; otherwise the generated image is primary.

Inputs are Runtime-managed files (`style_image`, `ref_video`; optional `use_image` and `env_file`) plus typed prompt, quality, format, resolution, inference, seed, and boolean controls. `dry_run` avoids provider calls. `skip_generate` requires `use_image`; `skip_animate` stops after image generation. The provider route requires `FAL_KEY`, and local video probing/frame extraction needs `ffprobe` and `ffmpeg`.

Invoke with the V3 SDK action API:

```python
result = sdk.invoke(
    "video_editing.animate_image",
    kind="action",
    project="demo",
    inputs={"style_image": style_image_id, "ref_video": driver_video_id},
    wait=True,
)
```
