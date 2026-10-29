export function validateHuggingFaceUrl(url: string): { isValid: boolean; message: string } {
  if (!url) return { isValid: false, message: 'URL is required' };

  if (url.startsWith('blob:')) {
    return {
      isValid: false,
      message: 'This is a blob URL (a temporary browser link). Use the direct /resolve/ download URL from HuggingFace instead.'
    };
  }

  // HuggingFace /blob/ URLs are view pages, not direct downloads — need /resolve/
  if (url.includes('huggingface.co') && url.includes('/blob/')) {
    return {
      isValid: false,
      message: 'This is a HuggingFace page link. Replace /blob/ with /resolve/ in the URL to get the direct download link.'
    };
  }

  // Check if it's a /resolve/ URL
  if (!url.includes('/resolve/')) {
    return {
      isValid: false,
      message: 'Must be a /resolve/ URL for direct download'
    };
  }

  // Check if it's a HuggingFace URL
  if (!url.includes('huggingface.co')) {
    return {
      isValid: false,
      message: 'Must be a HuggingFace URL'
    };
  }

  return { isValid: true, message: '' };
}
