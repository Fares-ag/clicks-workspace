import 'package:flutter/material.dart';

import '../../core/auth/admin_roles.dart';
import '../../core/components/paginated_list_screen.dart';

class GenericListScreen extends StatelessWidget {
  const GenericListScreen({
    super.key,
    required this.title,
    required this.endpoint,
    required this.moduleId,
  });

  final String title;
  final String endpoint;
  final String moduleId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: PaginatedListScreen(
        endpoint: endpoint,
        emptyMessage: 'No records',
        searchHint: 'Search',
        itemBuilder: (context, item) {
          final label = item.values
              .whereType<String>()
              .where((s) => s.isNotEmpty)
              .take(2)
              .join(' · ');
          return ListTile(
            title: Text(label.isEmpty ? 'Record' : label),
            subtitle: Text(AdminRoles.displayName(moduleId)),
          );
        },
      ),
    );
  }
}
