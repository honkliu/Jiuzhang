import React, { useCallback } from 'react';
import { Box, Container } from '@mui/material';
import { useSelector } from 'react-redux';
import PhotoAlbumPage from '@/components/Photos/PhotoAlbumPage';
import { AppHeader } from '@/components/Shared/AppHeader';
import { adminGalleryService } from '@/services/adminGallery.service';
import type { RootState } from '@/store';
import { useLanguage } from '@/i18n/LanguageContext';

const BoxAny = Box as any;

export const GalleryPage: React.FC = () => {
  const { user } = useSelector((state: RootState) => state.auth);
  const { t } = useLanguage();
  const canDeleteGalleryPhotos = Boolean(user?.isAdmin && user?.domain === 'kankan');
  const loadPhotos = useCallback(() => adminGalleryService.listPhotos(), []);
  const deletePhoto = useCallback((id: string) => adminGalleryService.deletePhoto(id), []);

  return (
    <>
      <AppHeader />
      <BoxAny sx={{ minHeight: '100vh', bgcolor: 'rgba(244, 247, 251, 0.5)', pt: { xs: 'calc(56px + 5px)', sm: 'calc(64px + 5px)' }, pb: 4 }}>
        <Container maxWidth="lg">
          <PhotoAlbumPage
            embedded
            title={t('photos.galleryTitle')}
            loadPhotosOverride={loadPhotos}
            deletePhotoOverride={canDeleteGalleryPhotos ? deletePhoto : undefined}
            showUpload={false}
            showExtraction={false}
            showReceiptGrouping={false}
            showStats={false}
            showDelete={canDeleteGalleryPhotos}
            viewModes={['grid', 'uploaded']}
            emptyTitle={t('photos.galleryEmptyTitle')}
            emptyDescription={t('photos.galleryEmptyDescription')}
            organizeGeneratedImages
          />
        </Container>
      </BoxAny>
    </>
  );
};

export default GalleryPage;
