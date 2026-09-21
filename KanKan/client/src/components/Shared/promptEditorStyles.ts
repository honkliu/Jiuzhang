export const promptEditorSurfaceSx = {
  bgcolor: 'rgba(18,18,18,0.9)',
  backgroundImage: 'none',
  color: '#fff',
  border: '1px solid #3a3a3a',
  boxShadow: 8,
  scrollbarWidth: 'none',
  msOverflowStyle: 'none',
  '&::-webkit-scrollbar': {
    display: 'none',
  },
} as const;

export const generationActionButtonSx = {
  height: 32,
} as const;

export const promptEditorTextFieldSx = {
  '& .MuiInputLabel-root': {
    color: '#bdbdbd',
  },
  '& .MuiInputLabel-root.Mui-focused': {
    color: 'primary.main',
  },
  '& .MuiInputBase-input': {
    color: '#fff',
    WebkitTextFillColor: '#fff',
    caretColor: '#fff',
  },
  '& .MuiInputBase-input::placeholder': {
    color: '#bdbdbd',
    opacity: 1,
  },
  '& .MuiOutlinedInput-root': {
    backgroundColor: 'rgba(58,58,58,0.96)',
    borderRadius: '8px',
  },
  '& textarea': {
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
  },
  '& textarea::-webkit-scrollbar': {
    display: 'none',
  },
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: '#fff',
  },
  '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': {
    borderColor: '#fff',
  },
  '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': {
    borderColor: '#fff',
  },
} as const;
