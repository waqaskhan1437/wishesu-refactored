/*
 * Data constants for the addon builder.  The TYPES array defines
 * available field types shown in the dropdown and the DEMO array
 * provides a small sample configuration used for initial seeding
 * during development.  These constants are attached to the global
 * window object so they can be accessed by other addon modules.
 */

;(function(){
  const TYPES = [
    { v: '', t: 'Select field type' },
    { v: 'heading', t: 'Heading' },
    { v: 'text', t: 'Text field' },
    { v: 'textarea', t: 'Long text / notes' },
    { v: 'email', t: 'Email' },
    { v: 'file', t: 'File upload' },
    { v: 'radio', t: 'Radio buttons' },
    { v: 'select', t: 'Dropdown list' },
    { v: 'checkbox_group', t: 'Checkbox group' }
  ];
  const DEMO = [
    { type: 'select', label: 'How many photos do you want to use?', options: [
      { label: 'Do not include photo', price: 0, default: true },
      { label: '1 photo', price: 0, file: true, fileQuantity: 1 },
      { label: '2 photos', price: 5, file: true, fileQuantity: 2 },
      { label: '3 photos', price: 8, file: true, fileQuantity: 3 }
    ] },
    { type: 'textarea', label: 'What shall we say', placeholder: 'e.g. Happy birthday video for Alice', required: true },
    { type: 'radio', label: 'Choose song', options: [
      { label: 'We choose it for you (faster & funnier)', price: 0, default: true },
      { label: 'I want my own music', price: 0, textField: true, textLabel: 'Song link or details', textPlaceholder: 'Paste link or describe song' }
    ] },
    { type: 'radio', label: 'Delivery time', options: [
      { label: 'Instant Delivery (60 Minutes)', price: 0, default: true, delivery: { instant: true, days: 1 } },
      { label: '24 Hours Express', price: 10, default: false, delivery: { instant: false, days: 1 } },
      { label: '2 Days Standard', price: 5, default: false, delivery: { instant: false, days: 2 } },
      { label: '3 Days Economy', price: 0, default: false, delivery: { instant: false, days: 3 } },
      { label: '4 Days Economy+', price: 0, default: false, delivery: { instant: false, days: 4 } }
    ] },
    { type: 'checkbox_group', label: 'Extras', options: [
      { label: 'Funny video cut', price: 10 },
      { label: 'Sing happy birthday', price: 15 },
      { label: 'Permission to post on social media', price: 0 }
    ] },
    { type: 'email', label: 'Email address', placeholder: 'Where we send the video', required: true }
  ];
  window.ADDON_TYPES = TYPES;
  window.ADDON_DEMO = DEMO;
})();