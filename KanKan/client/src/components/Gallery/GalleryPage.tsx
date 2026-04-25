import React, { useCallback } from 'react';
import { Box, Container } from '@mui/material';
import PhotoAlbumPage from '@/components/Photos/PhotoAlbumPage';
import { AppHeader } from '@/components/Shared/AppHeader';
import { adminGalleryService } from '@/services/adminGallery.service';

export const GalleryPage: React.FC = () => {
  const loadPhotos = useCallback(() => adminGalleryService.listPhotos(), []);
  const deletePhoto = useCallback((id: string) => adminGalleryService.deletePhoto(id), []);

  return (
    <>
      <AppHeader />
      <Box sx={{ minHeight: '100vh', bgcolor: 'rgba(244, 247, 251, 0.5)', pt: { xs: 'calc(56px + 5px)', sm: 'calc(64px + 5px)' }, pb: 4 }}>
        <Container maxWidth="lg">
          <PhotoAlbumPage
            embedded
            title="图览"
            loadPhotosOverride={loadPhotos}
            deletePhotoOverride={deletePhoto}
            showUpload={false}
            showExtraction={false}
            showReceiptGrouping={false}
            showStats={false}
            viewModes={['grid', 'uploaded']}
            emptyTitle="还没有可浏览图片"
            emptyDescription="uploads 和 uploads/receipts 目录下还没有图片。"
            organizeGeneratedImages
          />
        </Container>
      </Box>
    </>
  );
};

export default GalleryPage;
